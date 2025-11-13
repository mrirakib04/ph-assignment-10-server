import express from "express";
import cors from "cors";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
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
    const userChallengesCollection = database.collection("userChallenges");

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
    // GET Challenge Details
    app.get("/challenges/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const challenge = await challengesCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!challenge)
          return res
            .status(404)
            .json({ success: false, message: "Challenge not found" });
        res.json({ success: true, data: challenge });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          success: false,
          message: "Server error",
          error: error.message,
        });
      }
    });
    // GET user activities
    app.get("/my-activities/:userId", async (req, res) => {
      try {
        const { userId } = req.params;

        const pipeline = [
          { $match: { userId } },
          {
            $lookup: {
              from: "challenges",
              localField: "challengeId",
              foreignField: "_id",
              as: "challengeDetails",
            },
          },
          { $unwind: "$challengeDetails" },
          {
            $project: {
              _id: 1,
              status: 1,
              progress: 1,
              joinDate: 1,
              updateDate: 1,
              "challengeDetails.title": 1,
              "challengeDetails.category": 1,
              "challengeDetails.imageUrl": 1,
              "challengeDetails.description": 1,
            },
          },
        ];

        const userActivities = await userChallengesCollection
          .aggregate(pipeline)
          .toArray();

        res.send({
          success: true,
          count: userActivities.length,
          data: userActivities,
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });
    // Get user's joined challenge details
    app.get("/user-challenges/:userId/:challengeId", async (req, res) => {
      try {
        const { userId, challengeId } = req.params;

        const activity = await userChallengesCollection.findOne({
          userId: userId,
          _id: new ObjectId(challengeId),
        });

        if (!activity)
          return res.status(404).json({
            success: false,
            message: "User has not joined this challenge",
          });

        // Also get challenge details
        const challenge = await challengesCollection.findOne({
          _id: new ObjectId(activity.challengeId),
        });

        res.json({
          success: true,
          data: { ...activity, challengeDetails: challenge },
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
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
    // POST Join Challenge
    app.post("/challenges/join/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { userId } = req.body;

        // check if user already joined
        const existing = await userChallengesCollection.findOne({
          userId,
          challengeId: new ObjectId(id),
        });
        if (existing)
          return res
            .status(400)
            .json({ success: false, message: "Already joined" });

        // insert to userChallenges
        await userChallengesCollection.insertOne({
          userId,
          challengeId: new ObjectId(id),
          status: "Not Started",
          progress: 0,
          joinDate: new Date(),
        });

        // increment participants count
        await challengesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { participants: 1 } }
        );

        res.json({ success: true, message: "Joined challenge successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          success: false,
          message: "Server error",
          error: error.message,
        });
      }
    });

    // UPDATING
    // Update user's progress/status
    app.patch("/user-challenges/:userId/:challengeId", async (req, res) => {
      try {
        const { userId, challengeId } = req.params;
        const { status, progress } = req.body;

        const result = await userChallengesCollection.updateOne(
          { userId, _id: new ObjectId(challengeId) },
          { $set: { status, progress, updateDate: new Date() } }
        );

        if (result.matchedCount === 0)
          return res
            .status(404)
            .json({ success: false, message: "User challenge not found" });

        res.json({ success: true, message: "Progress updated successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
      }
    });
    // UPDATE Challenge Info
    app.patch("/challenges/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const updateData = req.body;

        // Add/replace updatedOn field
        updateData.updatedOn = new Date();

        const result = await challengesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Challenge not found",
          });
        }

        res.json({
          success: true,
          message: "Challenge updated successfully",
        });
      } catch (error) {
        console.error("Error updating challenge:", error);
        res.status(500).json({
          success: false,
          message: "Failed to update challenge",
          error: error.message,
        });
      }
    });

    // DELETING
    // Delete challenge
    app.delete("/delete/challenge/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const result = await challengesCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Challenge not found",
          });
        }

        res.send({
          success: true,
          message: "Challenge deleted successfully",
        });
      } catch (error) {
        console.error("Error deleting challenge:", error);
        res.status(500).send({
          success: false,
          message: "Failed to delete challenge",
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
