require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const User = require("./model/User");
const Transaction = require("./model/Transaction");


const app = express();
/* -------------------- MIDDLEWARE -------------------- */
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());

/* -------------------- DATABASE -------------------- */
mongoose.connect("mongodb://127.0.0.1:27017/atm_system")
  .then(() => console.log("MongoDB Connected ✅"))
  .catch(err => console.log("DB Error:", err));

/* -------------------- MAIL SETUP -------------------- */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL, pass: process.env.EMAIL_PASS }
});

/* -------------------- COMMON HELPERS -------------------- */

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const sendEmail = async (to, subject, text) => {
  await transporter.sendMail({
    from: process.env.EMAIL,
    to,
    subject,
    text
  });
};

const verifyOTP = (user, otp) => {
  if (!user.otp) return "No OTP requested";
  if (user.otp !== otp) return "Invalid OTP";
  if (Date.now() > user.otpExpiry) return "OTP expired";
  return null;
};

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
    console.log("JWT_SECRET in auth:", process.env.JWT_SECRET);
  } catch (error) {
  if (error.name === "TokenExpiredError") {
    return res.status(401).json({ message: "Token expired, please login again" });
  }

  return res.status(401).json({ message: "Invalid token" });
}
};
// update pin code 
const updatePin = async (user, newPin) => {
  user.pin = await bcrypt.hash(newPin, 10);
  user.otp = null;
  user.otpExpiry = null;
  user.isOtpVerified = false;
  await user.save();
};

// start route
/* -------------------- REGISTER -------------------- */
app.post("/register", async (req, res) => {
  try {
    const { name, email, accountNumber, pin } = req.body;

    if (!name || !email || !accountNumber || !pin)
      return res.status(400).json({ message: "All fields required" });

    if (await User.findOne({ accountNumber }))
      return res.status(400).json({ message: "Account exists" });

    if (await User.findOne({ email }))
      return res.status(400).json({ message: "Email exists" });

    await User.create({
      name,
      email,
      accountNumber,
      pin: await bcrypt.hash(pin, 10),
      balance: 0,
      isOtpVerified: false
    });

    res.json({ message: "Account Registered Successfully ✅" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* -------------------- LOGIN -------------------- */
app.post("/login", async (req, res) => {
  const { email, accountNumber } = req.body;

  const user = await User.findOne({ email, accountNumber });
  if (!user)
    return res.status(400).json({ message: "Invalid credentials" });

  user.otp = generateOTP();
  user.otpExpiry = Date.now() + 5 * 60 * 1000;
  await user.save();



  await sendEmail(email, "ATM Login OTP", `Your OTP is ${user.otp}`);

 
  res.json({ message: "OTP sent" });
});

/* -------------------- VERIFY LOGIN OTP -------------------- */
app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  const user = await User.findOne({ email });

  if (!user)
    return res.status(400).json({ message: "User not found" });

  const error = verifyOTP(user, otp);
  if (error)
    return res.status(400).json({ message: error });

  user.otp = null;
  user.otpExpiry = null;
  await user.save();

  const token = jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ message: "Login Successful ✅", token });
});

/* -------------------- FORGOT PIN -------------------- */
app.post("/forgot-pin", async (req, res) => {
  const { email, accountNumber } = req.body;

  const user = await User.findOne({ email: email.toLowerCase(), accountNumber });
  if (!user)
    return res.status(400).json({ message: "Invalid details" });

  user.otp = generateOTP();
  user.otpExpiry = Date.now() + 5 * 60 * 1000;
  user.isOtpVerified = false;
  await user.save();

  await sendEmail(email, "Forgot PIN OTP", `Your OTP is ${user.otp}`);

  res.json({ message: "OTP sent" });
});

/* -------------------- VERIFY FORGOT OTP -------------------- */
app.post("/verify-forgot-otp", async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({   email: email.toLowerCase()
 });
  if (!user)
    return res.status(400).json({ message: "User not found" });

  const error = verifyOTP(user, otp);
  if (error)
    return res.status(400).json({ message: error });

  user.isOtpVerified = true;
  await user.save();
  user.otp = null;
  user.otpExpiry = null;


  res.json({ message: "OTP Verified ✅" });
});
/* -------------------- SET NEW PIN -------------------- */
app.post("/set-new-pin", async (req, res) => {
  try {
    const { email, newPin } = req.body;

    if (!email || !newPin)
      return res.status(400).json({ message: "All fields required" });

    if (newPin.length !== 4)
      return res.status(400).json({ message: "PIN must be 4 digits" });

    const user = await User.findOne({
      email: email.toLowerCase()
    });

    if (!user)
      return res.status(404).json({ message: "User not found" });

    if (!user.isOtpVerified)
      return res.status(403).json({ message: "OTP not verified" });

    await updatePin(user, newPin);

    res.json({ message: "PIN Changed Successfully ✅" });
console.log("User Found:", user.email);
console.log("isOtpVerified:", user.isOtpVerified);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
});

/* -------------------- RESET PIN (Logged In) -------------------- */
app.post("/send-reset-otp", auth, async (req, res) => {
  const { oldPin } = req.body;

  const user = await User.findById(req.userId);

  if (!(await bcrypt.compare(oldPin, user.pin)))
    return res.status(401).json({ message: "Old PIN incorrect" });

  user.otp = generateOTP();
  user.otpExpiry = Date.now() + 5 * 60 * 1000;
  await user.save();

  await sendEmail(user.email, "Reset PIN OTP", `Your OTP is ${user.otp}`);

  res.json({ message: "OTP sent" });
});

app.post("/reset-pin", auth, async (req, res) => {
  try {
    const { otp, newPin } = req.body;

    if (!otp || !newPin) {
      return res.status(400).json({ message: "OTP and New PIN required" });
    }

    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify OTP
    const error = verifyOTP(user, otp);
    if (error) {
      return res.status(400).json({ message: error });
    }

    // Update PIN
    await updatePin(user, newPin);

    // Clear OTP after success
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.json({ message: "PIN Reset Successful ✅" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
});

/* -------------------- CHECK BALANCE -------------------- */
app.post("/check-balance", auth, async (req, res) => {
  try {
    console.log("UserID from token:", req.userId);

    const { pin } = req.body;
    const user = await User.findById(req.userId);

    console.log("User found:", user);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const match = await bcrypt.compare(pin, user.pin);

    if (!match) {
      return res.status(401).json({ message: "Wrong PIN" });
    }

    res.json({
      name: user.name,
      accountNumber: user.accountNumber,
     balance: user.balance 
    });

  } catch (err) {
    console.log("ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});
/* -------------------- DEPOSIT -------------------- */
app.post("/deposit", auth, async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ Pehle ka balance store
    const previousBalance = user.balance;

    // ✅ Deposit add
    user.balance += Number(amount);

    await user.save();

    // ✅ Transaction save
    await Transaction.create({
      accountNumber: user.accountNumber,
      type: "deposit",
      amount: Number(amount),
      balanceAfter: user.balance
    });

    // ✅ Proper response
    res.json({
     message: "Deposit successful ✅",
      previousBalance: previousBalance,
      depositedAmount: Number(amount),
      totalBalance: user.balance

    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error" });
  }
});

/* -------------------- WITHDRAW -------------------- */
app.post("/withdraw", auth, async (req, res) => {
  const { pin, amount } = req.body;

  if (!amount || amount <= 0)
    return res.status(400).json({ message: "Invalid amount" });

  const user = await User.findById(req.userId);

  if (!(await bcrypt.compare(pin, user.pin)))
    return res.status(401).json({ message: "Invalid PIN" });

  if (user.balance < amount)
    return res.status(400).json({ message: "Insufficient balance" });

  const previousBalance = user.balance;

  user.balance -= amount;
  await user.save();

  await Transaction.create({
    accountNumber: user.accountNumber,
    type: "withdraw",
    amount,
    balanceAfter: user.balance
  });

  res.json({  message: "Withdraw successful ✅",
    withdrawnAmount: Number(amount),   // 🔥 kitna nikala
    previousBalance: previousBalance,       // 🔥 pehle kitna tha
    totalBalance: user.balance  });
});

/* -------------------- TRANSACTION HISTORY -------------------- */
app.get("/transaction", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    if (!user)
      return res.status(404).json({ message: "User not found" });

    const transactions = await Transaction
      .find({ accountNumber: user.accountNumber })
      .sort({ date: -1 });

    res.json(transactions);

  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

/* ----------------- SERVER -------------------- */
app.listen(5000, () => {
  console.log("Server running on port 5000 🚀");
});