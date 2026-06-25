(async () => {
    const res = await fetch('https://api.jsonbin.io/v3/b/6a3bcc60da38895dfef72f76/latest', {
        headers: { 'X-Master-Key': '$2a$10$taCC8A46/1HYhSkqCEPyJejJ8iJrKyCRBy7xfzBECpMLJWshJ5P9u' }
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
})();
