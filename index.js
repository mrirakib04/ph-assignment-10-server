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
    const eventsCollection = database.collection("events");
    const tipsCollection = database.collection("tips");

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
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: "Invalid ID" });
        }
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
    // GET single joined challenge by its _id (aggregate)
    app.get("/joined/challenges/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const joinedChallenge = await userChallengesCollection
          .aggregate([
            {
              $match: { _id: new ObjectId(id) },
            },
            {
              $lookup: {
                from: "challenges",
                localField: "challengeId",
                foreignField: "_id",
                as: "challengeDetails",
              },
            },
            {
              $unwind: "$challengeDetails",
            },
            {
              $project: {
                _id: 1,
                userId: 1,
                status: 1,
                progress: 1,
                joinDate: 1,
                "challengeDetails._id": 1,
                "challengeDetails.title": 1,
                "challengeDetails.category": 1,
                "challengeDetails.description": 1,
                "challengeDetails.duration": 1,
                "challengeDetails.target": 1,
                "challengeDetails.impactMetric": 1,
                "challengeDetails.startDate": 1,
                "challengeDetails.endDate": 1,
                "challengeDetails.imageUrl": 1,
                "challengeDetails.updatedOn": 1,
              },
            },
          ])
          .next();

        if (!joinedChallenge)
          return res
            .status(404)
            .json({ success: false, message: "Joined challenge not found" });

        res.json({ success: true, data: joinedChallenge });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch joined challenge",
          error: error.message,
        });
      }
    });
    // GET simplified stats for HeroBanner
    app.get("/api/challenges/stats", async (req, res) => {
      try {
        // মোট challenges count
        const totalChallenges = await challengesCollection.countDocuments();

        // মোট participants sum
        const aggResult = await challengesCollection
          .aggregate([
            {
              $group: {
                _id: null,
                totalParticipants: { $sum: { $ifNull: ["$participants", 0] } },
              },
            },
          ])
          .toArray();

        const totalParticipants = aggResult[0]?.totalParticipants || 0;

        // Response
        res.json({
          success: true,
          data: {
            totalParticipants,
            totalChallenges,
            weeklyImpact: 20, // static value
          },
        });
      } catch (error) {
        console.error("Error fetching challenge stats:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch challenge stats",
          error: error.message,
        });
      }
    });

    // Get 6 events (limit)
    app.get("/events", async (req, res) => {
      try {
        const events = await eventsCollection
          .find()
          .sort({ date: 1 })
          .limit(6)
          .toArray();
        res.send({
          success: true,
          count: events.length,
          data: events,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to fetch events",
          error: error.message,
        });
      }
    });
    // GET - 5 recent tips
    app.get("/tips", async (req, res) => {
      try {
        const tips = await tipsCollection
          .find()
          .sort({ createdAt: -1 })
          .limit(5)
          .toArray();
        res.send({
          success: true,
          count: tips.length,
          data: tips,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to fetch tips",
          error: error.message,
        });
      }
    });
    // Get 6 recent challenges sorted by createdDate descending
    app.get("/recent/challenges", async (req, res) => {
      try {
        const recentChallenges = await challengesCollection
          .find()
          .sort({ createdDate: -1 })
          .limit(6)
          .toArray();

        res.send({
          success: true,
          count: recentChallenges.length,
          data: recentChallenges,
        });
      } catch (error) {
        console.error("Error fetching recent challenges:", error);
        res.status(500).send({
          success: false,
          message: "Failed to fetch recent challenges",
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
