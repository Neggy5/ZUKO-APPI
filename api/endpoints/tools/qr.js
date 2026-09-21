'use strict';
const QRCode = require('qrcode');
module.exports = {
  name:'QR Generator', method:'GET', path:'/v1/tools/qr', category:'Tools',
  description:'Generate a QR code PNG from text or a URL.',
  async execute({ query, res }) {
    const text = String(query.text || query.data || '').trim();
    if (!text) return { statusCode:400, data:{status:false,error:'text or data is required.'} };
    if (text.length > 4096) return { statusCode:400, data:{status:false,error:'Input is too long (maximum 4096 characters).'} };
    const png = await QRCode.toBuffer(text, { type:'png', width:512, margin:2, errorCorrectionLevel:'M' });
    res.setHeader('Content-Type','image/png');
    res.setHeader('Content-Disposition','inline; filename="zuko-qr.png"');
    res.setHeader('Content-Length', String(png.length));
    res.setHeader('X-ZUKO-Tool','qr');
    return res.end(png);
  }
};
