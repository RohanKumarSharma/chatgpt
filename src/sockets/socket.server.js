const { Server } = require("socket.io");
const cookie = require("cookie");
const jwt = require("jsonwebtoken");
const userModel = require("../models/user.model");
const aiService = require("../services/ai.service");
const messageModel = require("../models/message.model");
const { createMemory, queryMemory } = require("../services/vector.service");

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
      

      const message = await messageModel.create({
        chat: messagePayload.chat,
        user: socket.user._id,
        content: messagePayload.content,
        role: "user", 
      });

      const vectors = await aiService.generateVector(messagePayload.content);
      
      const memory = await queryMemory({
        queryVector: vectors,
        limit: 3,
        metadata: {}, 
      });

      await createMemory({
        vectors,
        messageId: message._id, //unique id dena hoga har message ka 
        metadata: {
          chat: messagePayload.chat,
          user: socket.user._id
        },
      });

      console.log(memory);

      const chatHistory = (await messageModel.find({
        chat: messagePayload.chat
      }).sort({ createdAt: -1 }).limit(20).lean()).reverse(); //ye 20 limit tk yaad rakhega sort lagane se 
        
        
      // if (chatHistory.length == 0) {
      //   const response = await aiService.generateResponse(
      //     "array khali hai re developers",
      //   );
      // } else {
      //   const response = await aiService.generateResponse(
      //     chatHistory.map((item) => {
      //       return {
      //         role: item.role,
      //         parts: [{ text: item.content }],
      //       };
      //     }),
      //   );
      // }

      const response = await aiService.generateResponse(
        chatHistory.map((item) => {
          return {
            role: item.role,
            parts: [{ text: item.content }]
          };
        }));

      const responseMessage = await messageModel.create({
        chat: messagePayload.chat,
        user: socket.user._id,
        content: response,
        role: "model",
      });

      const responseVectors = await aiService.generateVector(response);

      await createMemory({
        vectors: responseVectors,
        messageId: responseMessage._id, //unique id dena hoga har message ka
        metadata: {
          chat: messagePayload.chat,
          user: socket.user._id
        },
      });

      socket.emit("ai-response", {
        //iske through user ko response send kr deta hai ai
        content: response,
        chat: messagePayload.chat
      });
    });
  });
}

module.exports = initSocketServer;
