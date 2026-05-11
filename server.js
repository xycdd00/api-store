const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// ========== 环境变量配置 ==========
const NEWAPI_BASE_URL = process.env.NEWAPI_BASE_URL;
const NEWAPI_ADMIN_KEY = process.env.NEWAPI_ADMIN_KEY;
const IDATARIVER_API_KEY = process.env.IDATARIVER_API_KEY; // 用于iDataRiver回调中查询订单
const IDATARIVER_PRODUCT_ID = process.env.IDATARIVER_PRODUCT_ID; // 可选
// ==================================

// ---------- 接口1：生成兑换码 ----------
app.post('/generate-code', async (req, res) => {
    const { plan } = req.body;

    const quotas = {
        starter: 0.75,
        pro: 2.0,
        family: 0.5
    };
    const quota = quotas[plan];
    if (!quota) {
        return res.status(400).json({ success: false, message: '无效的套餐' });
    }

    try {
        const response = await axios.post(`${NEWAPI_BASE_URL}/api/redemption/`, {
            name: `套餐-${plan}`,
            count: 1,
            quota: quota,
            expired_time: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
        }, {
            headers: {
                'Authorization': `Bearer ${NEWAPI_ADMIN_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        let code = null;
        const data = response.data;
        if (data.data && data.data.length > 0) {
            code = data.data[0].key;
        } else if (data.key) {
            code = data.key;
        } else if (data.data && data.data.key) {
            code = data.data.key;
        }

        if (!code) {
            console.error('未提取到兑换码，响应:', JSON.stringify(data));
            return res.status(500).json({ success: false, message: '生成兑换码失败' });
        }

        res.json({ success: true, code: code, quota: quota, message: '兑换码已生成' });
    } catch (error) {
        console.error('生成兑换码出错:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: '兑换码生成失败，请稍后重试' });
    }
});

// ---------- 接口2：接收iDataRiver支付回调 ----------
app.post('/payment-callback', async (req, res) => {
    console.log('收到iDataRiver支付回调:', JSON.stringify(req.body));
    const { event, order_id, product_id } = req.body;

    // 只处理支付完成的事件 (事件名称取决于iDataRiver，可能为 'ORDER_COMPLETED')
    if (event !== 'ORDER_COMPLETED') {
        return res.status(200).send('Event not processed');
    }

    try {
        // 1. 根据订单ID查询订单详情，获取业务参数中的quota
        //    需要调用iDataRiver的订单查询接口，此处需要你根据iDataRiver API文档完善
        //    示例：const orderRes = await axios.get(`https://api.idatariver.com/mapi/order/query?order_id=${order_id}&secret=${IDATARIVER_API_KEY}`);
        //          const quota = JSON.parse(orderRes.data.result.states).quota;

        // 临时假设你从iDataRiver商品设置中获取默认quota或固定值
        let quota = 0.75; // 默认值，你需要替换为从订单真实获取

        // 2. 生成兑换码
        const newApiResponse = await axios.post(`${NEWAPI_BASE_URL}/api/redemption/`, {
            name: `自动-订单${order_id}`,
            count: 1,
            quota: quota,
            expired_time: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
        }, {
            headers: {
                'Authorization': `Bearer ${NEWAPI_ADMIN_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        let redemptionCode = null;
        const data = newApiResponse.data;
        if (data.data && data.data.length > 0) {
            redemptionCode = data.data[0].key;
        } else if (data.key) {
            redemptionCode = data.key;
        }

        if (!redemptionCode) {
            console.error('未提取到兑换码');
            return res.status(500).json({ code: -1, msg: '生成兑换码失败' });
        }

        console.log(`订单 ${order_id} 支付成功，生成兑换码: ${redemptionCode}`);

        // 3. 将兑换码通过邮件/短信/订单备注等方式发送给用户
        //    例如调用iDataRiver的添加订单备注接口
        //    await axios.post('https://api.idatariver.com/mapi/order/note', {...});

        // 告诉iDataRiver处理成功
        res.status(200).json({ code: 0, message: 'Webhook processed' });
    } catch (error) {
        console.error('处理支付回调出错:', error.response?.data || error.message);
        res.status(500).json({ code: -1, msg: 'Internal error' });
    }
});

// ---------- 启动服务器 ----------
app.listen(port, () => {
    console.log(`API商店运行在 http://localhost:${port}`);
    console.log('环境变量状态:');
    console.log('- NEWAPI_BASE_URL:', NEWAPI_BASE_URL ? '✅' : '❌');
    console.log('- NEWAPI_ADMIN_KEY:', NEWAPI_ADMIN_KEY ? '✅' : '❌');
    console.log('- IDATARIVER_API_KEY:', IDATARIVER_API_KEY ? '✅' : '❌');
});