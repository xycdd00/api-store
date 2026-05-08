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
const NEWAPI_USER_ID = process.env.NEWAPI_USER_ID;

app.post('/redeem', async (req, res) => {
    const { licenseKey } = req.body;
    if (!licenseKey) return res.status(400).json({ success: false, message: '授权码不能为空' });
    if (!IDATARIVER_API_KEY || !IDATARIVER_PRODUCT_ID || !NEWAPI_BASE_URL || !NEWAPI_ADMIN_KEY) {
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

        // 2. 获取额度
        let quota = 1000000;
        try { if (item.states) quota = JSON.parse(item.states).quota || quota; } catch (e) {}

       // 3. 调用 New API 创建令牌
console.log('创建 New API Token，额度:', quota);

const tokenRes = await axios.post(`${NEWAPI_BASE_URL}/api/token/`, {
    name: `购买-${licenseKey.substring(0, 8)}`,
    remain_quota: quota,
    unlimited_quota: false
}, {
    headers: {
        'Authorization': `Bearer ${NEWAPI_ADMIN_KEY}`,
        'Content-Type': 'application/json',
        'New-Api-User': NEWAPI_USER_ID || '1'  // 添加这个！
    }
});

        // 4. 提取 Token - 尝试多种可能
        let newToken = null;
        const resp = tokenRes.data;
        
        // 尝试各种可能的格式
        if (resp?.data?.key) newToken = resp.data.key;
        else if (resp?.data?.token) newToken = resp.data.token;
        else if (resp?.key) newToken = resp.key;
        else if (resp?.token) newToken = resp.token;
        else if (resp?.data?.data?.key) newToken = resp.data.data.key;
        
        console.log('提取的 Token:', newToken);

        if (!newToken) {
            return res.status(500).json({ 
                success: false, 
                message: '创建Token失败，请检查管理员Key是否正确' 
            });
        }

        // 5. 激活授权码
        try {
            await axios.post('https://api.idatariver.com/mapi/license/activate', {
                code: licenseKey,
                product_id: IDATARIVER_PRODUCT_ID
            }, {
                headers: { 'Authorization': `Bearer ${IDATARIVER_API_KEY}` }
            });
        } catch (e) {}

        // 6. 返回给前端
       res.json({ 
    success: true, 
    message: '兑换成功！', 
    apiKey: newToken,
    quota: codeObj.amount,
    apiUrl: NEWAPI_BASE_URL
});


    } catch (error) {
        console.error('出错:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: '兑换服务暂时不可用' });
    }
});

app.listen(port, () => console.log(`API商店运行在 http://localhost:${port}`));
