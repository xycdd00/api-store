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
        return res.status(500).json({ success: false, message: '服务器配置错误，请联系管理员' });
    }

    try {
        // 1. 验证授权码 (使用标准 Bearer Token)
        console.log(`正在验证授权码: ${licenseKey}`);
        const verifyRes = await axios.get(`https://api.idatariver.com/mapi/license/query`, {
            params: { code: licenseKey, product_id: IDATARIVER_PRODUCT_ID },
            headers: { 'Authorization': `Bearer ${IDATARIVER_API_KEY}` }
        });

        const licenseData = verifyRes.data;
        console.log('iDataRiver 验证响应:', JSON.stringify(licenseData));

        const item = licenseData.result?.items?.[0];
        if (!item || item.status !== 'VALID') {
            return res.status(400).json({ success: false, message: '授权码无效或已被使用' });
        }

        // 2. 从业务参数获取额度
        let quota = 1000000;
        try { if (item.states) quota = JSON.parse(item.states).quota || quota; } catch (e) {}

      // 3. 调用 New-API 创建令牌（尝试管理员端点）
console.log('正在通过管理员接口生成API令牌...');
let tokenRes;
try {
    // 首先尝试管理员专用路径
    tokenRes = await axios.post(`${NEWAPI_BASE_URL}/api/admin/token`, { // 注意这里是 /api/admin/token
        name: `购买-${licenseKey.substring(0, 8)}`,
        remain_quota: quota,
        unlimited_quota: false
    }, {
        headers: {
            'Authorization': `Bearer ${NEWAPI_ADMIN_KEY}`,
            'Content-Type': 'application/json'
        }
    });
    console.log('管理员接口响应:', JSON.stringify(tokenRes.data));
} catch (adminErr) {
    console.error('管理员接口失败，回退到普通接口...');
    // 如果管理员接口不通，则回退到我们之前用的接口
    tokenRes = await axios.post(`${NEWAPI_BASE_URL}/api/token/`, {
        name: `购买-${licenseKey.substring(0, 8)}`,
        remain_quota: quota,
        unlimited_quota: false
    }, {
        headers: {
            'Authorization': `Bearer ${NEWAPI_ADMIN_KEY}`,
            'Content-Type': 'application/json',
            'New-Api-User': NEWAPI_USER_ID
        }
    });
}

// 4. 解析令牌，如果还是没有key，则尝试查询令牌列表
let newToken = tokenRes.data.data?.key || tokenRes.data.key;

if (!newToken) {
    console.log('创建响应中未找到key，尝试从令牌列表中查询最新令牌...');
    try {
        const listRes = await axios.get(`${NEWAPI_BASE_URL}/api/token/?order=created_at&desc=true&limit=1`, {
            headers: {
                'Authorization': `Bearer ${NEWAPI_ADMIN_KEY}`,
                'New-Api-User': NEWAPI_USER_ID
            }
        });
        const tokens = listRes.data.data || listRes.data;
        if (tokens && tokens.length > 0) {
            newToken = tokens[0].key;
            console.log('从令牌列表中找到令牌:', newToken.substring(0, 10) + '...');
        }
    } catch (listErr) {
        console.error('查询令牌列表失败:', listErr.response?.data || listErr.message);
    }
}

if (!newToken) {
    console.error('解析令牌失败，所有方式均未获取到key');
    return res.status(500).json({ success: false, message: '令牌创建失败，请联系管理员' });
}

        // 5. 激活授权码 (使用标准 Bearer Token)
        try {
            await axios.post(`https://api.idatariver.com/mapi/license/activate`, {
                code: licenseKey,
                product_id: IDATARIVER_PRODUCT_ID
            }, {
                headers: { 'Authorization': `Bearer ${IDATARIVER_API_KEY}` }
            });
            console.log('授权码已激活');
        } catch (activateError) {
            console.error('激活授权码失败:', activateError.response?.data || activateError.message);
        }

        res.json({ success: true, message: '兑换成功！', apiKey: newToken });

    } catch (error) {
        console.error('兑换过程出错:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: '兑换服务暂时不可用，请联系管理员' });
    }
});

app.listen(port, () => console.log(`API商店运行在 http://localhost:${port}`));