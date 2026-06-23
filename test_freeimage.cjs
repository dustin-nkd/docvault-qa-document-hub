const https = require('https');
const fs = require('fs');
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const formData = '--boundary\r\nContent-Disposition: form-data; name="key"\r\n\r\n6d207e02198a847aa98d0a2a901485a5\r\n--boundary\r\nContent-Disposition: form-data; name="source"; filename="test.gif"\r\nContent-Type: image/gif\r\n\r\n' + gif.toString('binary') + '\r\n--boundary--\r\n';

const options = {
  hostname: 'freeimage.host',
  path: '/api/1/upload',
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=boundary'
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log(data));
});
req.write(Buffer.from(formData, 'binary'));
req.end();
