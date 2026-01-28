const { Server } = require("socket.io");
const cookie = require("cookie");
const jwt = require("jsonwebtoken");
const userModel = require("../models/user.model");
const aiService = require("../services/ai.service");
const messageModel = require("../models/message.model");
const { createMemory, queryMemory } = require("../services/vector.service");
const { text } = require("express");

function initSocketServer(httpServer) {
  const io = new Server(httpServer, {});
  // middleware of socket io
  io.use(async (socket, next) => {
    const cookies = cookie.parse(socket.handshake.headers?.cookie || "");

    console.log("Socket connection cookies:", cookies);

    if (!cookies.token) {
      next(new Error("Authentication error: No token provided"));
    }

    try {
      const decoded = jwt.verify(cookies.token, process.env.JWT_SECRET); 
      const user = await userModel.findById(decoded.id);

      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("ai-message", async (messagePayload) => {
      console.log(messagePayload); /* (chat , content) */

      /* const message = await messageModel.create({
        chat: messagePayload.chat,
        user: socket.user._id,
        content: messagePayload.content,
        role: "user",
      });

      const vectors = await aiService.generateVector(messagePayload.content);
      */

      const [message, vectors] = await Promise.all([
        // promise.all dono chizo ko ek sath start karega , aise time bachane ke liye krte hai, jab dono task ek dusre pr depend na ho to hum task ko ek sath mai start kr skte hai
        messageModel.create({
          chat: messagePayload.chat,
          user: socket.user._id,
          content: messagePayload.content,
          role: "user",
        }),
        aiService.generateVector(messagePayload.content),
      ]);
      await createMemory({
        vectors,
        messageId: message._id, //unique id dena hoga har message ka
        metadata: {
          chat: messagePayload.chat,
          user: socket.user._id,
          text: messagePayload.content,
        },
      });

      /*
      const memory = await queryMemory({
        queryVector: vectors,
        limit: 3,
        metadata: {user: socket.user._id},
      });


      const chatHistory = (
        await messageModel
          .find({
            chat: messagePayload.chat,
          })
          .sort({ createdAt: -1 })
          .limit(20)
          .lean()
      ).reverse(); //ye 20 limit tk yaad rakhega sort lagane se
      */

      const [memory, chatHistory] = await Promise.all([
        queryMemory({
          queryVector: vectors,
          limit: 3,
          metadata: { user: socket.user._id },
        }),

        messageModel
          .find({
            chat: messagePayload.chat,
          })
          .sort({ createdAt: -1 })
          .limit(20)
          .lean().then((messages) => messages.reverse())
      ]) //ye 20 limit tk yaad rakhega sort lagane se

      const stm = chatHistory.map((item) => {
        return {
          role: item.role,
          parts: [{ text: item.content }],
        };
      });

      const ltm = [
        {
          role: "user",
          parts: [
            {
              text: `
          these are some previous message from the chat, use them to generate a response${memory.map(item => item.metadata.text).join("\n")}`,
            },
          ],
        },
      ];

      const response = await aiService.generateResponse([...ltm, ...stm]);

      /* 
      const responseMessage = await messageModel.create({
        chat: messagePayload.chat,
        user: socket.user._id,
        content: response,
        role: "model",
      });

      const responseVectors = await aiService.generateVector(response);
      */

      socket.emit("ai-response", {
        //iske through user ko response send kr deta hai ai
        content: response,
        chat: messagePayload.chat, 
      });

      const [responseMessage, responseVectors] = await Promise.all([
        messageModel.create({
          chat: messagePayload.chat,
          user: socket.user._id,
          content: response,
          role: "model",
        }),
        aiService.generateVector(response),
      ]);

      await createMemory({
        vectors: responseVectors,
        messageId: responseMessage._id, //unique id dena hoga har message ka
        metadata: {
          chat: messagePayload.chat,
          user: socket.user._id,
        },
      });
      
    });
  });
}

module.exports = initSocketServer;
