const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// ============ 配置 ============
const IDATARIVER_API_KEY = 'sk_8c2853153ddac72b2322dd2bb6244b9a';
const IDATARIVER_PRODUCT_ID = '69f0f28f5bf6c3d12b2aca72';
const ONEAPI_BASE_URL = 'https://apistore.zeabur.app';
const ONEAPI_ADMIN_KEY = 'f5be58e5747f420aad6f3f3160bafe28';

// ============ 页面 ============
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ 兑换 API ============
app.post('/redeem', async (req, res) => {
    const { licenseKey } = req.body;
    
    if (!licenseKey) {
        return res.json({ success: false, message: '请输入授权码' });
    }
    
    try {
        // 1. 验证 iDataRiver 授权码
        const verifyRes = await axios.get('https://api.idatariver.com/mapi/license/query', {
            params: { code: licenseKey, product_id: IDATARIVER_PRODUCT_ID },
            headers: { 'Authorization': `Bearer ${IDATARIVER_API_KEY}` }
        });
        
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
        
        // 3. 创建 One API 用户 - 尝试不同格式
        const randomNum = Math.random().toString(36).substring(2, 10);
        const email = `user_${licenseKey.substring(0, 8)}_${randomNum}@example.com`;
        const password = randomNum + Math.random().toString(36).substring(2, 6).toUpperCase();
        
        console.log('创建 One API 用户:', email, password);
        
        let userId = null;
        
        // 尝试方式1: 标准参数
        try {
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
            console.log('方式1响应:', JSON.stringify(userRes.data));
            userId = userRes.data?.id;
        } catch (e1) {
            console.log('方式1失败:', e1.message);
            
            // 尝试方式2: 只用 username
            try {
                const userRes2 = await axios.post(`${ONEAPI_BASE_URL}/api/user`, {
                    username: email,
                    password: password,
                    display_name: `用户_${licenseKey.substring(0, 8)}`,
                    quota: quota
                }, {
                    headers: {
                        'Authorization': `Bearer ${ONEAPI_ADMIN_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });
                console.log('方式2响应:', JSON.stringify(userRes2.data));
                userId = userRes2.data?.id;
            } catch (e2) {
                console.log('方式2失败:', e2.message);
                
                // 尝试方式3: 简化参数
                try {
                    const userRes3 = await axios.post(`${ONEAPI_BASE_URL}/api/user`, {
                        email: email,
                        password: password
                    }, {
                        headers: {
                            'Authorization': `Bearer ${ONEAPI_ADMIN_KEY}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    console.log('方式3响应:', JSON.stringify(userRes3.data));
                    userId = userRes3.data?.id || userRes3.data?.data?.id;
                } catch (e3) {
                    console.log('方式3失败:', e3.message);
                }
            }
        }
        
        if (userId) {
            console.log('创建用户成功，用户ID:', userId);
            
            // 给用户充值额度
            try {
                await axios.put(`${ONEAPI_BASE_URL}/api/user/${userId}`, {
                    balance: quota
                }, {
                    headers: {
                        'Authorization': `Bearer ${ONEAPI_ADMIN_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });
            } catch (e) {
                console.log('充值额度失败:', e.message);
            }
        }
        
        // 4. 返回结果
        if (userId) {
            res.json({
                success: true,
                message: '兑换成功！',
                quota: quota,
                username: email,
                password: password,
                loginUrl: ONEAPI_BASE_URL,
                instructions: '请登录后创建 API Key 使用'
            });
        } else {
            res.json({
                success: false,
                message: '创建用户失败，请联系管理员'
            });
        }
        
    } catch (error) {
        console.error('兑换失败:', error.response?.data || error.message);
        res.json({ 
            success: false, 
            message: '兑换失败: ' + (error.response?.data?.message || error.message)
        });
    }
});

app.listen(port, () => {
    console.log(`兑换系统运行中`);
});
