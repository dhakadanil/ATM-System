require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const User = require('./model/User');
const Transaction = require('./model/Transaction');
const app = express();

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");



app.use(cors(
    {
  origin: "http://localhost:3000",
  credentials: true
    }
));
app.use(express.json());
const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
 service: "gmail",
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASS
    }

});


// MongoDB Connect  System
mongoose.connect("mongodb://127.0.0.1:27017/atm_system")
.then(() => {
    console.log("MongoDB Connected Successfully");
})
.catch((error) => {
    console.log("MongoDB Connection Failed:", error);
});



// REGISTER System 
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

      const hashedPin = await bcrypt.hash(pin, 10);

const user = new User({
   name,
   email,
   accountNumber,
   pin: hashedPin
});

        await user.save();

        res.send("Account Registered Successfully");

    } catch (error) {

        res.send(error.message);

    }

});



//  Login System
app.post("/login", async (req, res) => {
  const { email, accountNumber } = req.body;
  const user = await User.findOne({ email, accountNumber });

  if (!user) {
    return res.status(400).json({ message: "Email or Account Number Invalid" });
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
console.log(`Generated OTP for ${email}: ${otp}`);
  // ✅ Send JSON instead of plain text
  res.json({ message: "OTP sent to email" });
});


app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    return res.status(400).json({ message: "User not found" });
  }

  // Ensure OTP exists
  if (!user.otp) {
    return res.status(400).json({ message: "No OTP requested or already used" });
  }

  // Trim both sides for safety
  if (user.otp.trim() !== otp.trim()) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  // Check expiry
  if (Date.now() > user.otpExpiry) {
    return res.status(400).json({ message: "OTP expired" });
  }
  // OTP verified → clear it
  user.otp = null;
  user.otpExpiry = null;
  await user.save();

  const token = jwt.sign(
     { userId: user._id },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  res.json({ message: "Login Successful", token });
});


const authMiddleware = (req, res, next) => {
   const header = req.headers.authorization;

   if (!header) {
      return res.status(401).json({ message: "No token provided" });
   }

   const token = header.split(" ")[1];

   try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.userId = decoded.userId;   // ✅ FIX HERE

      next();
   } catch (error) {
      return res.status(401).json({ message: "Invalid token" });
   }
};


// CHECK BALANCE System
app.post("/check-balance", authMiddleware, async (req, res) => {
   try {
      const { pin } = req.body;

      const user = await User.findById(req.userId);
if (!pin) {
   return res.status(400).json({ message: "PIN is required" });
}

if (!user.pin) {
   return res.status(500).json({ message: "User PIN not set in database" });
}

const isMatch = await bcrypt.compare(String(pin), user.pin);

if (!isMatch) {
   return res.status(401).json({ message: "Wrong PIN ❌" });
}

      res.json({
         name: user.name,
         accountNumber: user.accountNumber,
         balance: user.balance
      });

   } catch (error) {
      res.status(500).json({ message: error.message });
   }
});





// DEPOSIT system
app.post("/deposit", authMiddleware, async (req, res) => {
  try {

    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        message: "Invalid deposit amount"
      });
    }

    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    // Update balance
    user.balance += Number(amount);
    await user.save();

    // Save transaction in MongoDB
    await Transaction.create({
      accountNumber: user.accountNumber,
      type: "deposit",
      amount: Number(amount),
      balanceAfter: user.balance
    });

    res.status(200).json({
      message: "Deposit successful ✅",
      totalBalance: user.balance
    });

  } catch (error) {
    console.log("Deposit Error:", error);
    res.status(500).json({
      message: "Server Error"
    });
  }
});




// WITHDRAW system 
app.post("/withdraw", authMiddleware, async (req, res) => {

    try {
        const { pin, amount } = req.body;
           const user = await User.findById(req.userId);
        if (!user) {
            return res.json({
                message: "Account not found"
            });
        }
   const isMatch = await bcrypt.compare(pin, user.pin);
if (!isMatch) {
   return res.status(401).json({
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
    accountNumber: user.accountNumber,
            type: "withdraw",
            amount: amount,
            balanceAfter: user.balance
        });

        // Custom response
        res.json({
            message: `Withdraw ${amount} successful`,
           accountNumber: user.accountNumber,
            availableBalance: user.balance
        });
    } catch (error) {
        res.json({
            message: error.message
        });
    }
});


app.get("/transaction/:accountNumber", authMiddleware, async (req, res) => {

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
 console.log("JWT Secret:", process.env.JWT_SECRET);

});
