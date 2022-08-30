const express = require('express');
const { MongoClient, ObjectId } = require("mongodb");
const SHA256 = require('crypto-js/sha256');
const { randomInt } = require('crypto');
const bodyParser = require('body-parser');

const app = express();
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));

// parse application/json
app.use(bodyParser.json());

const port = 8000;
const mongoDbUri = 'mongodb://127.0.0.1:27017';

const client = new MongoClient(mongoDbUri);
const database = client.db('land-records');
const Users = database.collection('users');
const Chain = database.collection('chain');

/**
 * Class definition of a single block of the blockchain
 */
class Block {
    index;
    timestamp;
    owner;
    ownerId;
    referenceNumber;
    size;
    price;
    previousHash;
    hash;
    nonce;

    constructor(data){
        this.index = 0;
        this.timestamp = new Date().getTime();
        this.owner = null;
        this.ownerId = null;
        this.referenceNumber = data.referenceNumber;
        this.size = data.size;
        this.price = data.price;
        this.previousHash = '0';
        this.hash = this.calculateHash();
        this.nonce = randomInt(0, 1000000);
    }

    calculateHash() {
        return SHA256(this.index + this.previousHash + this.timestamp + this.owner + this.ownerId + this.referenceNumber + this.size + this.price + this.nonce).toString();
    }
};

/**
 * The Genesis Block. The first block of data that is processed and validated to form a new blockchain, often referred to as block 0 or block 1. https://coinmarketcap.com/alexandria/glossary/genesis-block
 */
const genesisBlock = new Block({ referenceNumber: '0', size: '0', price: 0 });

/**
 * Checks whether the current blockchain is valid
 * @returns validity of the blockchain in the form of a boolean expression
 * @example const valid = await isBlockchainValid();
 */
const isBlockchainValid = async () => {
    const records = await Chain.find({}).project({ _id: 0 }).toArray();
    const blockchain = records.map((record) => {
        const currentBlock = new Block({ referenceNumber: record.referenceNumber, size: record.size, price: record.price });
        currentBlock.owner = record.owner;
        currentBlock.ownerId = record.ownerId;
        currentBlock.index = record.index;
        currentBlock.timestamp = record.timestamp;
        currentBlock.nonce = record.nonce;
        currentBlock.previousHash = record.previousHash;
        currentBlock.hash = record.hash;
        return currentBlock;
    });

    for (let i = 1; i < blockchain.length; i++) {
        const currentBlock = blockchain[i];
        const previousBlock = blockchain[i - 1];

        if (currentBlock.hash !== currentBlock.calculateHash()) {
            console.log(`Block ${i} has an invalid hash`);
            return false;
        }

        if (currentBlock.previousHash !== previousBlock.hash) {
            console.log(`Block ${i}'s previous hash is invalid`);
            return false;
        }
    }
    return true;
}

/**
 * API for initial seeding of the app
 * Needs a JSON object containers an array of users and records
 * @example 
 * {
    "users":[
        {
            "name": "John",
            "credit": 1000000
        },
        {
            "name": "Peter",
            "credit": 50000
        },
        {
            "name": "Juliet",
            "credit": 5000000
        }
    ],
    "records": [
        {
            "referenceNumber": "LK23GH6",
            "size": "10Ha",
            "price": 100000
        },
        {
            "referenceNumber": "LK23GI7",
            "size": "1Ha",
            "price": 10000
        },
        {
            "referenceNumber": "LK23GH7",
            "size": "25Ha",
            "price": 1000000
        }
    ]
}
 */
app.post('/seed', async (req, res) => {
    try {
        await Users.insertMany(req.body.users);
        const blocks = [genesisBlock];
        for (let i = 0; i < req.body.records.length; i++) {
            let newBlock = new Block(req.body.records[i]);
            newBlock.index = i + 1;
            newBlock.previousHash = blocks[i].hash;
            newBlock.hash = newBlock.calculateHash();
            blocks.push(newBlock);
        }
        await Chain.insertMany(blocks);
        res.status(201).send({ message: 'database seeded successfully'});
    } catch(e) {
        console.log(e);
        res.status(500).send({ error: e});;
    }
});

/**
 * API for creating a single user
 * {
 *  "name":"John",
 *  "credit": 1000000
 * }
 */
app.post('/users', async (req, res) => {
    try {
        const result = await Users.insertOne(req.body);
        res.status(201).send({ message: 'user added successfully', id: result.insertedId });;
    } catch(e) {
        console.log(e);
        res.status(500).send({ error: e});
    }
});

/**
 * API for getting all users
 */
app.get('/users', async (req, res) => {
    try {
        const users = await Users.find({}).toArray();
        res.status(200).send({ users });
    } catch(e) {
        console.log(e);
        res.status(500).send({ error: e});
    }
});

/**
 * API for getting one user
 */
 app.get('/users/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const user = await Users.findOne({ _id: new ObjectId(userId) });
        res.status(200).send({ user });
    } catch(e) {
        console.log(e);
        res.status(500).send({ error: e});
    }
});

/**
 * API for creating a single land record
 * {
 *  "referenceNumber": "LK23GH6",
 *  "size": "10Ha",
 *  "price": 100000
 * }
 */
app.post('/landRecords', async (req, res) => {
    try {
        const lastRecord = await Chain.find({}).sort({ _id: -1 }).limit(1).toArray();
        const recordsCount = await Chain.estimatedDocumentCount();
        const recordExists = await Chain.findOne({ referenceNumber: req.body.referenceNumber });
        if (recordExists) {
            res.status(400).send({ message: 'The record exists in the database' });
        } else {
            let newBlock = new Block(req.body);
            if (recordsCount ===  0) {
                newBlock.index = 1;
                newBlock.previousHash = genesisBlock.hash;
                newBlock.hash = newBlock.calculateHash();
                const blocks = [genesisBlock, newBlock];
                await Chain.insertMany(blocks);
                res.status(201).send({ message: 'record added successfully'});
            } else {
                newBlock.index = recordsCount;
                newBlock.previousHash = lastRecord[0].hash;
                newBlock.hash = newBlock.calculateHash();
                await Chain.insertOne(newBlock);
                res.status(201).send({ message: 'record added successfully'});
            }
        }
    } catch(e) {
        console.log(e);
        res.status(500).send({ error: e});
    }
});

/**
 * API for getting all land records
 * Returns an error is the blockchain has been compromised
 */
app.get('/landRecords', async (req, res) => {
    try {
        const valid = await isBlockchainValid();
        if (!valid) {
            res.status(404).send({ message: `Sorry, the blockchain has been compromised`});
        } else {
            const records = await Chain.find({}).project({ _id: 0 }).toArray();
            res.status(200).send({ records });
        }
    } catch(e) {
        console.log(e);
        res.status(500).send({ error: e});
    }
});

/**
 * API for getting land records by reference Number
 * @example localhost:3000/landRecords/LK23GH6
 */
app.get('/landRecords/:referenceNumber', async (req, res) => {
    try {
        const { referenceNumber } = req.params;
        const valid = await isBlockchainValid();
        if (!valid) {
            res.status(404).send({ message: `Sorry, the blockchain has been compromised`});
        } else {
            const records = await Chain.find({ referenceNumber }).project({ _id: 0 }).toArray();
            res.status(200).send({ records });
        }
    } catch(e) {
        console.log(e);
        res.status(500).send({ error: e}); 
    }
});

/**
 * API for transferring land from one owner to another
 * @example localhost:3000/transfer/LK23GH6/62d5211d95b29ef5e67083e7
 */
app.post('/transfer/:referenceNumber/:userId', async (req, res) => {
    try {
        const { referenceNumber, userId } = req.params;
        const valid = await isBlockchainValid();
        if (!valid) {
            res.status(404).send({ message: 'Sorry, the blockchain has been compromised'});
        } else {
            const recordsCount = await Chain.estimatedDocumentCount();
            const records = await Chain.find({ referenceNumber }).sort({ _id: -1 }).toArray();
            const lastRecord = await Chain.find({}).sort({ _id: -1 }).limit(1).toArray();
            const user = await Users.findOne({ _id: new ObjectId(userId) });
            if (records.length === 0) {
                res.status(404).send({ message: 'Land not found'});
            } else if (!user) {
                res.status(404).send({ message: 'User not found'});
            } else if (records[0].ownerId && userId === records[0].ownerId.toHexString()) {
                res.status(400).send({ message: 'Sorry, you can"t transfer land to the existing owner'});
            } else if (user.credit < records[0].price) {
                res.status(400).send({ message: 'Sorry, you don"t have enough credit to buy this land'});
            } else {
                await Users.updateOne({ _id: new ObjectId(userId) }, { $inc: { credit: -records[0].price }});
                await Users.updateOne({ _id: records[0].ownerId },  { $inc: { credit: records[0].price }});
                let newBlock = new Block({ referenceNumber: records[0].referenceNumber, size: records[0].size, price: records[0].price });
                newBlock.owner = user.name;
                newBlock.ownerId = user._id;
                newBlock.index = recordsCount;
                newBlock.previousHash = lastRecord[0].hash;
                newBlock.hash = newBlock.calculateHash();
                await Chain.insertOne(newBlock);
                res.status(200).send({ message: `Transfer complete. ${user.name} is now the new owner of land ${records[0].referenceNumber}`});
            }
        }
    } catch(e) {
        console.log(e);
        res.status(500).send({ error: e}); 
    }
});

app.listen(port, () => {
    console.log(`land record-keeping app listening on port ${port}`);
});