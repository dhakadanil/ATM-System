const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
    accountNumber: {
        type: String,
    },
    type: {
        type: String,
        required: true   // deposit or withdraw
    },
    amount: {
        type: Number,
        required: true
    },
    balanceAfter: {
        type: Number,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Transaction", transactionSchema);