const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({

    name: String,

    email: {
        type: String,
        required: true,
        unique: true
    },

    accountNumber: {
        type: String,
        required: true,
        unique: true
    },

    pin: String,

    balance: {
        type: Number,
        default: 0
    },

    otp: String,

    otpExpiry: Date

});

module.exports = mongoose.model("User", userSchema);
