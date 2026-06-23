const https = require('https');
const fs = require('fs');
// create a tiny 1x1 gif
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const formData = '--boundary\r\nContent-Disposition: form-data; name="image"; filename="test.gif"\r\nContent-Type: image/gif\r\n\r\n' + gif.toString('binary') + '\r\n--boundary--\r\n';

const options = {
  hostname: 'api.imgur.com',
  path: '/3/image',
  method: 'POST',
  headers: {
    'Authorization': 'Client-ID 8d26dad1f185657',
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
