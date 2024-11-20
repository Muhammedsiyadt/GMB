require("dotenv").config();
const jwt = require('jsonwebtoken');
const connection = require("../connection/db");



const GenerateJWT = (userId) => {
    if (!userId) {
        throw new Error("User ID must be provided");
    }
    const token = jwt.sign({ 'userid': userId }, process.env.SECRET, { expiresIn: "30d" });
    return token;
}

module.exports = GenerateJWT;