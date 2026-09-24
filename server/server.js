require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors')
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const dns = require("dns")
dns.setServers([
    "1.1.1.1",
    "8.8.8.8"
])

const app = express();
app.use(cors());
app.use(express.json());

// Middleware: JSON data ko read karne ke liye (bahut zaroori hai)
app.use(express.json()); 


const { RtcTokenBuilder, RtcRole } = require('agora-access-token');

// Inko aap Agora Console (agora.io) se free account banakar le sakte hain
const AGORA_APP_ID = process.env.AGORA_APP_ID || "YOUR_AGORA_APP_ID";
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || "YOUR_AGORA_APP_CERTIFICATE";

// Token Generate karne ka API Route
app.get('/api/agora-token', (req, res) => {
    const channelName = req.query.channelName;
    if (!channelName) {
        return res.status(400).json({ error: 'channelName is required' });
    }

    // Har user ke liye ek random ID
    const uid = Math.floor(Math.random() * 100000); 
    const role = RtcRole.PUBLISHER;
    
    // Token ki validity (1 ghante ke liye)
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // Token Build karna
    const token = RtcTokenBuilder.buildTokenWithUid(
        AGORA_APP_ID,
        AGORA_APP_CERTIFICATE,
        channelName,
        uid,
        role,
        privilegeExpiredTs
    );

    return res.json({ token, uid, channelName });
});

// ==========================================
// 1. DATABASE CONNECTION
// ==========================================
// Apna Mongoose (MongoDB Atlas) wala link yahan double quotes ke andar dalein
 const dbURI = "mongodb+srv://arifshamim0786_db_user:Arifshamim123@cluster0.8hg4wpa.mongodb.net/?appName=Cluster0"

mongoose.connect(dbURI)
  .then(() => console.log("✅ MongoDB Successfully Connected!"))
  .catch((err) => console.log("❌ MongoDB Connection Error: ", err));


// ==========================================
// 2. USER SCHEMA & MODEL
// ==========================================
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'users' }],
  emailVerified: { type: Boolean, default: false },
  emailVerificationToken: { type: String },
  emailVerificationExpires: { type: Date },
  magicLoginToken: { type: String },
  magicLoginExpires: { type: Date },
  lastUsernameChange: { type: Date, default: null }
}, { timestamps: true });

const User = mongoose.model('users', userSchema);

const friendRequestSchema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  status: { type: String, enum: ['pending', 'accepted'], default: 'pending' }
}, { timestamps: true });

const FriendRequest = mongoose.model('friendrequests', friendRequestSchema);

// Security Key
const JWT_SECRET = "TalkVault_Super_Secret_Key_2026";

const mailer = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
}) : null;
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

async function sendLinkEmail({ to, subject, link, action }) {
  if (!mailer) {
    console.log(`[dev] ${action} link for ${to}: ${link}`);
    return;
  }
  await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to, subject, text: `Open this link to ${action}: ${link}`
  });
}

function createSession(user) {
  return jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: "1d" });
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function publicUser(user) {
  return {
    id: user._id ? user._id.toString() : user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    phone: user.phone,
    lastUsernameChange: user.lastUsernameChange
  };
}

async function getAuthenticatedUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return await User.findById(decoded.id);
  } catch (error) {
    return null;
  }
}

function canChangeUsername(user) {
  if (!user.lastUsernameChange) return true;
  const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(user.lastUsernameChange).getTime() >= tenDaysMs;
}

// ==========================================
// 3. APIS (LOGIN & REGISTER)
// ==========================================

// --- Naya Account Banane Ke Liye (REGISTER) ---
app.post('/register', async (req, res) => {
  try {
    const { name, username, email, phone, password } = req.body;
    if (!name || !username || !email || !phone || !password) {
      return res.status(400).json({ error: "Name, username, email, phone and password are required" });
    }

    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername || normalizedUsername.length < 3 || normalizedUsername.length > 20) {
      return res.status(400).json({ error: "Username must be between 3 and 20 characters." });
    }

    const existingUser = await User.findOne({ $or: [
      { email: email.toLowerCase() }, { username: normalizedUsername }, { phone }
    ] });
    if (existingUser) {
      return res.status(400).json({ error: "Email, username or phone number already exists!" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const newUser = new User({
      name,
      username: normalizedUsername,
      email: email.toLowerCase(),
      phone,
      password: hashedPassword,
      emailVerified: true,
      emailVerificationToken,
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000,
      lastUsernameChange: null
    });
    await newUser.save();
    await sendLinkEmail({
      to: newUser.email, subject: 'Verify your TalkVault email',
      link: `${clientUrl}/verify-email?token=${emailVerificationToken}`,
      action: 'verify your TalkVault email'
    });

    res.status(201).json({ message: "Account created successfully. You can log in now." });
  } catch (error) {
    res.status(500).json({ error: "Server error during registration" });
  }
});

// --- Login Karne Ke Liye (LOGIN) ---
app.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: "Username, email or phone and password are required" });
    }

    const normalizedIdentifier = String(identifier).trim().toLowerCase();
    const user = await User.findOne({ $or: [
      { username: normalizedIdentifier }, { email: normalizedIdentifier }, { phone: String(identifier).trim() }
    ] });
    if (!user) {
      return res.status(400).json({ error: "User not found!" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials!" });
    }
    const token = createSession(user);

    res.json({
      message: "Login successful!",
      token: token,
      user: publicUser(user)
    });

  } catch (error) {
    res.status(500).json({ error: "Server error during login" });
  }
});

app.get('/me', async (req, res) => {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    return res.json({ user: publicUser(authUser) });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to load profile.' });
  }
});

app.get('/users', async (req, res) => {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const users = await User.find({ _id: { $ne: authUser._id } }).select('name username email phone').lean();
    return res.json({ users: users.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone
    })) });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to load users.' });
  }
});

app.get('/friends', async (req, res) => {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const user = await User.findById(authUser._id).populate('friends', 'name username email phone');
    const incoming = await FriendRequest.find({ recipient: authUser._id, status: 'pending' }).populate('requester', 'name username email phone');
    const outgoing = await FriendRequest.find({ requester: authUser._id, status: 'pending' }).populate('recipient', 'name username email phone');

    res.json({
      friends: (user?.friends || []).map((friend) => ({
        id: friend._id.toString(),
        name: friend.name,
        username: friend.username,
        email: friend.email,
        phone: friend.phone
      })),
      incoming: incoming.map((request) => ({
        id: request._id.toString(),
        requester: {
          id: request.requester._id.toString(),
          name: request.requester.name,
          username: request.requester.username,
          email: request.requester.email,
          phone: request.requester.phone
        }
      })),
      outgoing: outgoing.map((request) => ({
        id: request._id.toString(),
        recipient: {
          id: request.recipient._id.toString(),
          name: request.recipient.name,
          username: request.recipient.username,
          email: request.recipient.email,
          phone: request.recipient.phone
        }
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Unable to load friends.' });
  }
});

app.post('/friends/request', async (req, res) => {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const targetIdentifier = String(req.body.identifier || '').trim();
    if (!targetIdentifier) {
      return res.status(400).json({ error: 'Please provide a username, email, or phone.' });
    }

    const targetUser = await User.findOne({
      $or: [
        { username: targetIdentifier.toLowerCase() },
        { email: targetIdentifier.toLowerCase() },
        { phone: targetIdentifier }
      ]
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found for friend request.' });
    }

    if (targetUser._id.toString() === authUser._id.toString()) {
      return res.status(400).json({ error: 'You cannot send a friend request to yourself.' });
    }

    const existing = await FriendRequest.findOne({
      $or: [
        { requester: authUser._id, recipient: targetUser._id },
        { requester: targetUser._id, recipient: authUser._id }
      ],
      status: 'pending'
    });

    if (existing) {
      return res.status(400).json({ error: 'A pending friend request already exists.' });
    }

    const authUserRecord = await User.findById(authUser._id);
    if ((authUserRecord.friends || []).some((friendId) => friendId.toString() === targetUser._id.toString())) {
      return res.status(400).json({ error: 'This user is already in your friend list.' });
    }

    const request = await FriendRequest.create({
      requester: authUser._id,
      recipient: targetUser._id,
      status: 'pending'
    });

    res.status(201).json({
      message: 'Friend request sent successfully.',
      request: {
        id: request._id.toString(),
        recipient: {
          id: targetUser._id.toString(),
          name: targetUser.name,
          username: targetUser.username,
          email: targetUser.email
        }
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Unable to send friend request.' });
  }
});

app.post('/friends/accept', async (req, res) => {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const { requestId } = req.body;
    if (!requestId) {
      return res.status(400).json({ error: 'Request ID is required.' });
    }

    const request = await FriendRequest.findById(requestId).populate('requester recipient');
    if (!request || request.status !== 'pending') {
      return res.status(404).json({ error: 'Friend request not found.' });
    }

    if (request.recipient._id.toString() !== authUser._id.toString()) {
      return res.status(403).json({ error: 'You cannot accept a request that is not for you.' });
    }

    request.status = 'accepted';
    await request.save();

    const requester = await User.findById(request.requester._id);
    const recipient = await User.findById(request.recipient._id);

    if (!requester.friends) requester.friends = [];
    if (!recipient.friends) recipient.friends = [];

    if (!requester.friends.some((friendId) => friendId.toString() === recipient._id.toString())) {
      requester.friends.push(recipient._id);
    }

    if (!recipient.friends.some((friendId) => friendId.toString() === requester._id.toString())) {
      recipient.friends.push(requester._id);
    }

    await requester.save();
    await recipient.save();

    res.json({ message: 'Friend request accepted.', request });
  } catch (error) {
    res.status(500).json({ error: 'Unable to accept friend request.' });
  }
});

app.post('/change-username', async (req, res) => {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const { username } = req.body;
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername || normalizedUsername.length < 3 || normalizedUsername.length > 20) {
      return res.status(400).json({ error: 'Username must be between 3 and 20 characters.' });
    }

    if (normalizedUsername === authUser.username) {
      return res.status(400).json({ error: 'This is already your current username.' });
    }

    if (!canChangeUsername(authUser)) {
      const waitMs = 10 * 24 * 60 * 60 * 1000 - (Date.now() - new Date(authUser.lastUsernameChange).getTime());
      const waitDays = Math.ceil(waitMs / (24 * 60 * 60 * 1000));
      return res.status(400).json({
        error: `You can change your username again in ${waitDays} day(s).`
      });
    }

    const usernameTaken = await User.findOne({
      username: normalizedUsername,
      _id: { $ne: authUser._id }
    });

    if (usernameTaken) {
      return res.status(400).json({ error: 'This username is already taken.' });
    }

    authUser.username = normalizedUsername;
    authUser.lastUsernameChange = new Date();
    await authUser.save();

    res.json({
      message: 'Username updated successfully.',
      user: publicUser(authUser)
    });
  } catch (error) {
    res.status(500).json({ error: 'Unable to update username.' });
  }
});


// ==========================================
// 4. SERVER START
// ==========================================
const PORT = 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
  });
}

module.exports = {
  app,
  User,
  publicUser,
  createSession,
  normalizeUsername,
  getAuthenticatedUser
};

app.post('/login/email-link', async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const user = email ? await User.findOne({ email }) : null;
    if (user) {
      const magicLoginToken = crypto.randomBytes(32).toString('hex');
      user.magicLoginToken = magicLoginToken;
      user.magicLoginExpires = Date.now() + 15 * 60 * 1000;
      await user.save();
      await sendLinkEmail({
        to: user.email, subject: 'Your TalkVault one-time login link',
        link: `${clientUrl}/email-login?token=${magicLoginToken}`,
        action: 'sign in to TalkVault (this link works once)'
      });
    }
    res.json({ message: "If that email is registered, a one-time login link has been sent." });
  } catch (error) {
    res.status(500).json({ error: "Unable to send login link" });
  }
});

app.get('/verify-email', async (req, res) => {
  try {
    const user = await User.findOne({
      emailVerificationToken: req.query.token, emailVerificationExpires: { $gt: new Date() }
    });
    if (!user) return res.status(400).json({ error: "Verification link is invalid or expired" });
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();
    res.json({ message: "Email verified successfully. You can log in now." });
  } catch (error) {
    res.status(500).json({ error: "Unable to verify email" });
  }
});

app.get('/login/email-link/verify', async (req, res) => {
  try {
    const user = await User.findOne({
      magicLoginToken: req.query.token, magicLoginExpires: { $gt: new Date() }
    });
    if (!user) return res.status(400).json({ error: "Login link is invalid, expired or already used" });
    user.magicLoginToken = undefined;
    user.magicLoginExpires = undefined;
    user.emailVerified = true;
    await user.save();
    res.json({ message: "Login successful!", token: createSession(user), user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ error: "Unable to complete email login" });
  }
});