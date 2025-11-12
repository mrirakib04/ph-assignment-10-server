import express from "express";
import cors from "cors";
import { MongoClient, ServerApiVersion } from "mongodb";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
dotenv.config();

const port = process.env.PORT || 3030;
const app = express();

// middleware
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_ACCESS}@cluster0.bfqzn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    // Connections
    const database = client.db(process.env.DB_NAME);
    const usersCollection = database.collection("users");
    const challengesCollection = database.collection("challenges");

    // READING
    // Get all challenges
    app.get("/challenges", async (req, res) => {
      try {
        const { search } = req.query;

        const query = {};
        if (search) {
          query.title = { $regex: search, $options: "i" };
        }

        const challenges = await challengesCollection.find(query).toArray();

        res.send({
          success: true,
          count: challenges.length,
          data: challenges,
        });
      } catch (error) {
        console.error("Error fetching challenges:", error);
        res.status(500).send({
          success: false,
          message: "Failed to fetch challenges",
          error: error.message,
        });
      }
    });

    // POSTING
    // Challenges
    app.post("/challenges", async (req, res) => {
      try {
        const {
          title,
          category,
          description,
          duration,
          target,
          participants,
          impactMetric,
          createdBy,
          startDate,
          endDate,
          imageUrl,
        } = req.body;

        const newChallenge = {
          title,
          category,
          description,
          duration: parseInt(duration),
          target,
          participants: participants || 0,
          impactMetric,
          createdBy,
          startDate,
          endDate,
          imageUrl,
          createdDate: new Date().toISOString(),
          status: "active",
        };

        const result = await challengesCollection.insertOne(newChallenge);

        res.send({
          success: true,
          message: "Challenge added successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error adding challenge:", error);
        res.status(500).send({
          success: false,
          message: "Failed to add challenge",
          error: error.message,
        });
      }
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("EcoTrack server");
});

app.listen(port, () => {
  console.log(`EcoTrack server listening on port ${port}`);
});
