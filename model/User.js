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
pin: {
   type: String,
   required: true
},

    balance: {
        type: Number,
        default: 0
    },

    isOtpVerified: {
  type: Boolean,
  default: false
},
    otp: String,

    otpExpiry: Date

});

module.exports = mongoose.model("User", userSchema);
