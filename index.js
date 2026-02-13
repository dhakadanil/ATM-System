require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const User = require('./model/User');
const Transaction = require('./model/Transaction');
const app = express();

app.use(express.json());
const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
 service: "gmail",
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASS
    }

});



mongoose.connect("mongodb://127.0.0.1:27017/atm_system")
.then(() => {
    console.log("MongoDB Connected Successfully");
})
.catch((error) => {
    console.log("MongoDB Connection Failed:", error);
});

// REGISTER
app.post("/register", async (req, res) => {

    try {

        const { name, email, accountNumber, pin } = req.body;

        // check accountNumber already exists
        const existingUser = await User.findOne({ accountNumber });

        if (existingUser) {
            return res.send("Account Number already exists");
        }

        // check email already exists
        const existingEmail = await User.findOne({ email });

        if (existingEmail) {
            return res.send("Email already registered");
        }

        const user = new User({
            name,
            email,
            accountNumber,
            pin
        });

        await user.save();

        res.send("Account Registered Successfully");

    } catch (error) {

        res.send(error.message);

    }

});




app.post("/login", async (req, res) => {
    const { email, accountNumber } = req.body;
    const user = await User.findOne({ email, accountNumber });
    if (!user) {
        return res.send("Email or Account Number Invalid");

    }
    // generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.otp = otp;

    user.otpExpiry = Date.now() + 5 * 60 * 1000;

    await user.save();


    // send email
    await transporter.sendMail({
        from: process.env.EMAIL,
        to: email,
        subject: "ATM Login OTP",
        text: `Your OTP is ${otp}`

    });
    res.send("OTP sent to email");
});

app.post("/verify-otp", async (req, res) => {

    const { email, otp } = req.body;

    const user = await User.findOne({ email });

    if (!user) {

        return res.send("User not found");

    }

    if (user.otp !== otp) {

        return res.send("Invalid OTP");

    }

    if (user.otpExpiry < Date.now()) {

        return res.send("OTP expired");

    }

    res.send("Login Successful");

});
// CHECK BALANCE
app.post("/check-balance", async (req, res) => {
    try {
        const { accountNumber } = req.body;
        const user = await User.findOne({ accountNumber });
        if (!user) {
            return res.send("User not found");
        }
        res.send({
            name:user.name,
            accountNumber: user.accountNumber,
            balance: user.balance
        });
    } catch (error) {
        res.send(error.message);
    }
});

// DEPOSIT
app.post("/deposit", async (req, res) => {
    try {
        const { accountNumber, amount } = req.body;
        const user = await User.findOne({ accountNumber });
        if (!user) {
            return res.send("User not found");
        }
        user.balance += Number(amount);
        await user.save();
           // save transaction
        await Transaction.create({

            accountNumber: accountNumber,
            type: "deposit",
            amount: amount,
            balanceAfter: user.balance

        });
        res.send({
            message: "Deposit successful",
            balance: user.balance
        });
    } catch (error) {
        res.send(error.message);
    }
});


// WITHDRAW
app.post("/withdraw", async (req, res) => {

    try {

        const { accountNumber, pin, amount } = req.body;

        const user = await User.findOne({ accountNumber });

        if (!user) {
            return res.json({
                message: "Account not found"
            });
        }

        if (user.pin !== pin) {
            return res.json({
                message: "Invalid PIN"
            });
        }
        if (user.balance < amount) {
            return res.json({
                message: "Insufficient balance",
                availableBalance: user.balance
            });
        }
        // withdraw
        user.balance = user.balance - amount;
        await user.save();
                // save transaction
        await Transaction.create({

            accountNumber: accountNumber,
            type: "withdraw",
            amount: amount,
            balanceAfter: user.balance

        });

        // Custom response
        res.json({
            message: `Withdraw ${amount} successful`,
            accountNumber: accountNumber,
            availableBalance: user.balance
        });

    } catch (error) {

        res.json({
            message: error.message
        });

    }

});


app.get("/transaction/:accountNumber", async (req, res) => {

    try {

        const accountNumber = req.params.accountNumber;

        const transactions = await Transaction.find({ accountNumber })
            .sort({ date: -1 });

        res.json(transactions);

    } catch (error) {

        res.send(error.message);

    }

});


// server start karo
app.listen(5000, () => {
  console.log("Server running on port 5000");
});
