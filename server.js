const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// ============ 配置 ============
const IDATARIVER_API_KEY = process.env.IDATARIVER_API_KEY || 'sk_8c2853153ddac72b2322dd2bb6244b9a';
const IDATARIVER_PRODUCT_ID = process.env.IDATARIVER_PRODUCT_ID || '69f0f28f5bf6c3d12b2aca72';
const ONEAPI_BASE_URL = process.env.ONEAPI_BASE_URL || 'https://apistore.zeabur.app';
const ONEAPI_ADMIN_KEY = process.env.ONEAPI_ADMIN_KEY || 'f5be58e5747f420aad6f3f3160bafe28';

console.log('启动配置:', { IDATARIVER_API_KEY, IDATARIVER_PRODUCT_ID, ONEAPI_BASE_URL });

// ============ 页面 ============
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ 兑换 API ============
app.post('/redeem', async (req, res) => {
    const { licenseKey } = req.body;
    
    console.log('收到兑换请求:', licenseKey);
    
    if (!licenseKey) {
        return res.json({ success: false, message: '请输入授权码' });
    }
    
    try {
        // 1. 验证 iDataRiver 授权码
        console.log('调用 iDataRiver API...');
        console.log('API Key:', IDATARIVER_API_KEY ? '已设置' : '未设置');
        console.log('Product ID:', IDATARIVER_PRODUCT_ID);
        
        const verifyRes = await axios.get('https://api.idatariver.com/mapi/license/query', {
            params: { code: licenseKey, product_id: IDATARIVER_PRODUCT_ID },
            headers: { 'Authorization': `Bearer ${IDATARIVER_API_KEY}` }
        });
        
        console.log('iDataRiver 响应:', JSON.stringify(verifyRes.data));
        
        const item = verifyRes.data.result?.items?.[0];
        if (!item || item.status !== 'VALID') {
            return res.json({ success: false, message: '授权码无效或已被使用' });
        }
        
        // 2. 获取额度
        let quota = 1000000;
        try {
            if (item.states) {
                quota = JSON.parse(item.states).quota || quota;
            }
        } catch (e) {}
        
        console.log('获取额度:', quota);
        
        // 3. 创建 One API 用户
        const randomNum = Math.random().toString(36).substring(2, 10);
        const email = `user_${licenseKey.substring(0, 8)}_${randomNum}@example.com`;
        const password = randomNum + Math.random().toString(36).substring(2, 6).toUpperCase();
        
        console.log('创建 One API 用户:', email);
        
        const userRes = await axios.post(`${ONEAPI_BASE_URL}/api/user`, {
            email: email,
            password: password,
            name: `用户_${licenseKey.substring(0, 8)}`,
            balance: quota
        }, {
            headers: {
                'Authorization': `Bearer ${ONEAPI_ADMIN_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('One API 创建用户响应:', JSON.stringify(userRes.data));
        
        // 4. 激活授权码
        try {
            await axios.post('https://api.idatariver.com/mapi/license/activate', {
                code: licenseKey,
                product_id: IDATARIVER_PRODUCT_ID
            }, {
                headers: { 'Authorization': `Bearer ${IDATARIVER_API_KEY}` }
            });
        } catch (e) {
            console.log('激活授权码失败:', e.message);
        }
        
        console.log(`兑换成功：${licenseKey} -> 额度 ${quota}`);
        
        // 5. 返回结果
        res.json({
            success: true,
            message: '兑换成功！',
            quota: quota,
            username: email,
            password: password,
            loginUrl: ONEAPI_BASE_URL,
            instructions: '请登录后创建 API Key 使用'
        });
        
    } catch (error) {
        console.error('兑换失败:', error.response?.data || error.message);
        res.json({ 
            success: false, 
            message: '兑换失败: ' + (error.response?.data?.error || error.message)
        });
    }
});

app.listen(port, () => {
    console.log(`兑换系统运行中`);
});
