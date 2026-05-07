const express = require('express');
const axios = require('axios');
const app = express();
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// ============ 环境变量配置 ============
// 需要在 Zeabur 或 .env 中设置以下变量：

// iDataRiver 配置
const IDATARIVER_API_KEY = process.env.IDATARIVER_API_KEY;
const IDATARIVER_PRODUCT_ID = process.env.IDATARIVER_PRODUCT_ID;

// New API 配置
const NEWAPI_BASE_URL = process.env.NEWAPI_BASE_URL;      // 如：https://xycdd001.zeabur.app
const NEWAPI_ADMIN_KEY = process.env.NEWAPI_ADMIN_KEY;    // 管理员 Key
const NEWAPI_USER_ID = process.env.NEWAPI_USER_ID;        // 用户 ID

// ======================================

// 主页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 管理员页面
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 兑换接口
app.post('/redeem', async (req, res) => {
    const { licenseKey } = req.body;
    
    // 1. 验证输入
    if (!licenseKey) {
        return res.status(400).json({ 
            success: false, 
            message: '授权码不能为空' 
        });
    }
    
    // 2. 检查配置
    if (!IDATARIVER_API_KEY || !IDATARIVER_PRODUCT_ID || 
        !NEWAPI_BASE_URL || !NEWAPI_ADMIN_KEY) {
        return res.status(500).json({ 
            success: false, 
            message: '服务器配置错误，请联系管理员' 
        });
    }
    
    try {
        // ========== 3. 验证授权码 ==========
        console.log('验证授权码:', licenseKey);
        
        const verifyRes = await axios.get('https://api.idatariver.com/mapi/license/query', {
            params: { 
                code: licenseKey, 
                product_id: IDATARIVER_PRODUCT_ID, 
                secret: IDATARIVER_API_KEY 
            }
        });
        
        console.log('验证结果:', JSON.stringify(verifyRes.data));
        
        const item = verifyRes.data.result?.items?.[0];
        
        if (!item || item.status !== 'VALID') {
            return res.status(400).json({ 
                success: false, 
                message: '授权码无效或已被使用' 
            });
        }
        
        // ========== 4. 获取额度 ==========
        let quota = 1000000;  // 默认 100 万额度
        try { 
            if (item.states) {
                const states = JSON.parse(item.states);
                quota = states.quota || quota;
            }
        } catch (e) {
            console.log('解析额度失败，使用默认值');
        }
        
        console.log('用户额度:', quota);
        
        // ========== 5. 创建 New API Token ==========
        console.log('创建 Token...');
        
        const tokenRes = await axios.post(
            `${NEWAPI_BASE_URL}/api/token/`,
            {
                name: `购买-${licenseKey.substring(0, 8)}`,
                remain_quota: quota,
                unlimited_quota: false
            },
            {
                headers: {
                    'Authorization': `Bearer ${NEWAPI_ADMIN_KEY}`,
                    'Content-Type': 'application/json',
                    'New-Api-User': NEWAPI_USER_ID
                }
            }
        );
        
        console.log('Token 创建响应:', JSON.stringify(tokenRes.data));
        
        // 提取 Token
        let newToken = null;
        const responseData = tokenRes.data;
        
        if (responseData.data?.key) {
            newToken = responseData.data.key;
        } else if (responseData.key) {
            newToken = responseData.key;
        } else if (responseData.data?.data?.key) {
            newToken = responseData.data.data.key;
        }
        
        if (!newToken) {
            console.error('Token 创建失败，响应:', JSON.stringify(responseData));
            return res.status(500).json({ 
                success: false, 
                message: 'Token 创建失败，请联系管理员' 
            });
        }
        
        // ========== 6. 激活授权码 ==========
        console.log('激活授权码...');
        
        await axios.post('https://api.idatariver.com/mapi/license/activate', null, {
            params: { 
                code: licenseKey, 
                product_id: IDATARIVER_PRODUCT_ID, 
                secret: IDATARIVER_API_KEY 
            }
        });
        
        console.log('兑换成功！');
        
        // ========== 7. 返回结果 ==========
        res.json({ 
            success: true, 
            message: '兑换成功！', 
            apiKey: newToken,
            quota: quota,
            apiUrl: NEWAPI_BASE_URL
        });
        
    } catch (error) {
        console.error('兑换出错:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false, 
            message: '兑换服务暂时不可用，请稍后重试' 
        });
    }
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        newApiUrl: NEWAPI_BASE_URL,
        configured: !!(IDATARIVER_API_KEY && NEWAPI_ADMIN_KEY)
    });
});

app.listen(port, () => {
    console.log(`🎁 兑换系统运行在 http://localhost:${port}`);
    console.log(`管理员后台：http://localhost:${port}/admin`);
});
