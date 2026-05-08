const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const IDATARIVER_API_KEY = process.env.IDATARIVER_API_KEY;
const IDATARIVER_PRODUCT_ID = process.env.IDATARIVER_PRODUCT_ID;
const NEWAPI_BASE_URL = process.env.NEWAPI_BASE_URL;
const NEWAPI_ADMIN_KEY = process.env.NEWAPI_ADMIN_KEY;

app.post('/redeem', async (req, res) => {
    const { licenseKey } = req.body;
    if (!licenseKey) return res.status(400).json({ success: false, message: '授权码不能为空' });
    if (!IDATARIVER_API_KEY || !IDATARIVER_PRODUCT_ID || !NEWAPI_ADMIN_KEY) {
        return res.status(500).json({ success: false, message: '服务器配置错误' });
    }

    try {
        // 1. 验证授权码
        console.log(`验证授权码: ${licenseKey}`);
        const verifyRes = await axios.get('https://api.idatariver.com/mapi/license/query', {
            params: { code: licenseKey, product_id: IDATARIVER_PRODUCT_ID },
            headers: { 'Authorization': `Bearer ${IDATARIVER_API_KEY}` }
        });

        const licenseData = verifyRes.data;
        console.log('iDataRiver 响应:', JSON.stringify(licenseData));

        const item = licenseData.result?.items?.[0];
        if (!item || item.status !== 'VALID') {
            return res.status(400).json({ success: false, message: '授权码无效或已被使用' });
        }

        // 获取额度
        let quota = 1000000;
        try { if (item.states) quota = JSON.parse(item.states).quota || quota; } catch (e) {}

        // 激活授权码
        try {
            await axios.post('https://api.idatariver.com/mapi/license/activate', {
                code: licenseKey,
                product_id: IDATARIVER_PRODUCT_ID
            }, {
                headers: { 'Authorization': `Bearer ${IDATARIVER_API_KEY}` }
            });
        } catch (e) {}

        // 生成随机用户名和密码
        const randomNum = Math.random().toString(36).substring(2, 10);
        const email = `user_${licenseKey.substring(0, 8)}_${randomNum}@temp-mail.com`;
        const password = randomNum + Math.random().toString(36).substring(2, 6).toUpperCase();

        console.log('创建用户:', email);

       // 创建 New API 用户
const createUserRes = await axios.post(`${NEWAPI_BASE_URL}/api/user/`, {
    email: email,
    password: password,
    name: `用户_${licenseKey.substring(0, 8)}`,
    balance: quota
}, {
    headers: {
        'Authorization': `Bearer ${NEWAPI_ADMIN_KEY}`,
        'Content-Type': 'application/json',
        'New-Api-User': '1'
    }
});

        console.log('创建用户响应:', JSON.stringify(createUserRes.data));

        let userId = createUserRes.data?.id || createUserRes.data?.data?.id;

        // 创建用户 Token
        let apiKey = null;
        try {
            const tokenRes = await axios.post(`${NEWAPI_BASE_URL}/api/token/`, {
                name: `Token_${licenseKey.substring(0, 8)}`,
                remain_quota: quota,
                unlimited_quota: false
            }, {
                headers: {
                    'Authorization': `Bearer ${NEWAPI_ADMIN_KEY}`,
                    'Content-Type': 'application/json',
                    'New-Api-User': userId ? userId.toString() : '1'
                }
            });
            
            console.log('Token创建响应:', JSON.stringify(tokenRes.data));
            apiKey = tokenRes.data?.data?.key || tokenRes.data?.key;
        } catch (tokenErr) {
            console.log('创建Token失败:', tokenErr.message);
        }

        // 返回结果
        res.json({ 
            success: true, 
            message: '兑换成功！',
            quota: quota,
            apiKey: apiKey,
            username: email,
            password: password,
            loginUrl: NEWAPI_BASE_URL,
            instructions: apiKey ? 
                '你的API Key已生成，请妥善保管！' : 
                '账号密码已生成，请登录后创建API Key使用！'
        });

    } catch (error) {
        console.error('出错:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false, 
            message: '兑换服务暂时不可用: ' + (error.response?.data?.message || error.message)
        });
    }
});

app.listen(port, () => console.log(`API商店运行在 http://localhost:${port}`));
