const express = require('express');

const app = express()
const port = 3000

app.listen(port, () => {
    console.log(`land record-keeping app listening on port ${port}`);
})