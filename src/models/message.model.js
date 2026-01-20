const mongoose = require("mongoose");


const messageSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    },
    chat: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "chat"
    },
    content: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ["user", "model","system"],  // enum ki value in tino mai se koi ek ho sakta hai by default humne user de diya hai
        default: "user"
    }
}, {
    timestamps: true 
})

const messageModel = mongoose.model("message", messageSchema);

module.exports = messageModel;