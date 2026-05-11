const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// ========== 环境变量配置 ==========
const NEWAPI_BASE_URL = process.env.NEWAPI_BASE_URL;          // 例如 https://你的new-api域名
const NEWAPI_ADMIN_KEY = process.env.NEWAPI_ADMIN_KEY;        // New API 系统访问令牌
// ==================================

// 新增：生成兑换码接口
app.post('/generate-code', async (req, res) => {
    const { plan } = req.body;   // 前端传过来的套餐标识，如 'starter', 'pro', 'family'

    // 1. 根据套餐设定对应额度（单位：美元，按 New API 的计费逻辑）
    const quotas = {
        starter: 0.75,     // 开发者入门：$0.75 额度
        pro: 2.0,           // 专家进阶：$2.0 额度
        family: 0.5          // AI全家桶：$0.5 额度
    };
    const quota = quotas[plan];
    if (!quota) {
        return res.status(400).json({ success: false, message: '无效的套餐' });
    }

    // 2. 调用 New API 管理接口创建兑换码
    try {
        const response = await axios.post(`${NEWAPI_BASE_URL}/api/redemption/`, {
            name: `套餐兑换码-${plan}`,
            count: 1,
            quota: quota,
            // 兑换码有效期（可选）：设置为 30 天后过期
            expired_time: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
        }, {
            headers: {
                'Authorization': `Bearer ${NEWAPI_ADMIN_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        // New API 返回的兑换码通常在 data 字段中
        const redemptionData = response.data;
        console.log('生成兑换码响应:', JSON.stringify(redemptionData));

        // 尝试多种可能的返回结构
        let code = null;
        if (redemptionData.data && redemptionData.data.length > 0) {
            code = redemptionData.data[0].key;       // 常见的返回格式
        } else if (redemptionData.key) {
            code = redemptionData.key;
        } else if (redemptionData.data && redemptionData.data.key) {
            code = redemptionData.data.key;
        }

        if (!code) {
            console.error('未从New API响应中提取到兑换码，请检查接口返回结构');
            return res.status(500).json({ success: false, message: '生成兑换码失败，请联系管理员' });
        }

        res.json({ success: true, code: code, quota: quota, message: '兑换码已生成' });
    } catch (error) {
        console.error('生成兑换码出错:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: '兑换码生成失败，请稍后再试' });
    }
});

// 保留原来的 /redeem 接口可以删除或保留，但前端已不用
// 这里为了兼容可以保留，但不再推荐使用

const express = require('express');
const axios = require('axios');
const app = express();
// ... 你的其他配置 (NEWAPI_BASE_URL, NEWAPI_ADMIN_KEY 等)

app.post('/payment-callback', async (req, res) => {
    console.log('收到iDataRiver支付回调:', JSON.stringify(req.body));
    const { event, order_id, product_id, user_id } = req.body; // 根据iDataRiver实际回调参数调整

    // 1. 安全检查：只处理订单支付完成的事件
    if (event !== 'ORDER_COMPLETED') {
        return res.status(200).send('Event not processed'); // 不是支付成功事件，不处理
    }

    try {
        // 2. 查询iDataRiver订单详情，获取业务参数(quota)
        //    你需要使用iDataRiver的商户API Key来查询订单，此处为伪代码示意
        const orderDetails = await getIdataRiverOrderDetails(order_id, product_id); 
        const quota = orderDetails.quota; // 从iDataRiver商品业务参数中获取额度

        // 3. 调用你的New API接口生成兑换码
        const newApiResponse = await axios.post(`${process.env.NEWAPI_BASE_URL}/api/redemption/`, {
            name: `自动生成-订单${order_id}`,
            count: 1,
            quota: quota, 
            expired_time: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 // 30天有效期
        }, {
            headers: { 'Authorization': `Bearer ${process.env.NEWAPI_ADMIN_KEY}` }
        });

        const redemptionCode = newApiResponse.data.data[0].key;
        console.log(`订单 ${order_id} 支付成功，生成兑换码: ${redemptionCode}`);

        // 4. 将兑换码发货给用户 (通过邮件、站内信或iDataRiver订单备注等)
        //    例如，你可以将兑换码更新到iDataRiver的订单备注中
        await addOrderNoteToIdataRiver(order_id, redemptionCode);

    } catch (error) {
        console.error('处理支付回调出错:', error.response?.data || error.message);
    }

    // 重要：向iDataRiver返回成功状态，否则它会重复通知
    res.status(200).json({ code: 0, message: 'Webhook processed successfully' });
});

app.listen(port, () => {
    console.log(`API商店运行在 http://localhost:${port}`);
    console.log('环境变量状态:');
    console.log('- NEWAPI_BASE_URL:', NEWAPI_BASE_URL ? '✅' : '❌');
    console.log('- NEWAPI_ADMIN_KEY:', NEWAPI_ADMIN_KEY ? '✅' : '❌');
});