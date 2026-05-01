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
        // 1. 验证授权码
        const verifyRes = await axios.get('https://api.idatariver.com/mapi/license/query', {
            params: { code: licenseKey, product_id: IDATARIVER_PRODUCT_ID, secret: IDATARIVER_API_KEY }
        });
        const item = verifyRes.data.result?.items?.[0];
        if (!item || item.status !== 'VALID') {
            return res.status(400).json({ success: false, message: '授权码无效或已被使用' });
        }

        // 2. 从业务参数获取额度
        let quota = 1000000;
        try { if (item.states) quota = JSON.parse(item.states).quota || quota; } catch (e) {}

        // 3. 调用New-API创建令牌
        const tokenRes = await axios.post(`${NEWAPI_BASE_URL}/api/token/`, {
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

        const newToken = tokenRes.data.data?.key || tokenRes.data.key;
        if (!newToken) return res.status(500).json({ success: false, message: '令牌生成失败' });

        // 4. 激活授权码
        await axios.post('https://api.idatariver.com/mapi/license/activate', null, {
            params: { code: licenseKey, product_id: IDATARIVER_PRODUCT_ID, secret: IDATARIVER_API_KEY }
        });

        res.json({ success: true, message: '兑换成功！', apiKey: newToken });

    } catch (error) {
        console.error('兑换出错:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: '兑换服务暂时不可用' });
    }
});

app.listen(port, () => console.log(`API商店运行在 http://localhost:${port}`));