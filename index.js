require('dotenv').config();
const express = require('express')
const app = express();
const cors = require('cors')
const admin = require("firebase-admin");
const stripe = require("stripe")(process.env.SECRET_KEY)

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors())
app.use(express.json());


const serviceAccount = require("./fast-drop-bd-firebase-key.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


// Routes
app.get("/", (req, res) => {
    res.send("Server is running!");
});

// MongoDB connection

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@servercluster.nvwzi5y.mongodb.net/?appName=ServerCluster`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        const db = client.db("fastDropDB");
        const parcelsCollection = db.collection("parcels");
        const paymentCollection = db.collection("payments");
        const userCollection = db.collection("users");
        // custom middleware to verify JWT token
        const verifyFBToken = async (req, res,next) => {
            // console.log("verifying token" , req.headers.authorization)
            const authHeader = req.headers.authorization;
            if(!authHeader){
                return res.status(401).send({message: "Unauthorized access"})
            }
            const token = authHeader.split(" ")[1];
            if(!token){
                return res.status(401).send({message: "Unauthorized access"})
            }
            //verify token

            next()
        } 
        //get parcel API
        //save user info to database
        app.post("/users", async (req, res) => {
            const user = req.body;
            const query = {email: user.email};
            const existingUser = await userCollection.findOne(query);
            if(existingUser){
                return res.send({message: "User already exists"});
            }
            const result = await userCollection.insertOne(user);
            res.send(result)
        })
         
        // Get parcels by user email
        app.get('/parcels',verifyFBToken, async (req, res) => {
            
            const email = req.query.email
            const query = email ? { senderEmail: email } : {}
            const result = await parcelsCollection.find(query).toArray()
            res.send(result)
        })
        //get parcel by id
        app.get("/parcels/:id", async (req, res) => {
            
            try {
                const id = req.params.id;
                const parcel = await parcelsCollection.findOne({ _id: new ObjectId(id) });
                if (!parcel) {
                    return res.status(404).send({ message: "Parcel not found" });
                }
                res.send(parcel);
            } catch (error) {
                res.status(500).send({ message: "Server error", error });
            }
        });

        // Add parcel API
        app.post("/parcels", async (req, res) => {
            const parcelData = req.body;
            const result = await parcelsCollection.insertOne(parcelData);
            res.send(result)
        });

        // Mark parcel as paid
        app.patch("/parcels/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const { transactionId } = req.body;

                // Update parcel in MongoDB
                const result = await parcelsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { paid: true, transactionId: transactionId } }
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).send({ message: "Parcel not found or already updated" });
                }

                res.send({ message: "Payment recorded successfully" });
            } catch (error) {
                console.error(error);
                res.status(500).send({ error: error.message });
            }
        });
        //Payment intent
        app.post("/create-payment-intent", async (req, res) => {
            try {
                const { amount } = req.body
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amount,
                    currency: "usd",
                    payment_method_types: ["card"]
                })

                res.send({
                    clientSecret: paymentIntent.client_secret
                })
            } catch (error) {
                res.status(500).send({ error: error.message })
            }
        })

        //Save payment info to database
        app.post("/payments", async (req, res) => {
            try {
                const paymentData = req.body;
                const result = await paymentCollection.insertOne(paymentData);
                res.send(result)
            }
            catch (error) {
                console.error(error);
                res.status(500).send({ error: error.message });
            }
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
