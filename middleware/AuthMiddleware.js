require("dotenv").config();
const jwt = require("jsonwebtoken");
const connection = require("../connection/db");




const verifyToken = async (req, res, next) => {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(400).json({ error: true, message: "Token is not provided" });
    }

    try {
        
        const decoded = jwt.verify(token, process.env.SECRET);
        const userId = decoded.userid;

        
        const query = "SELECT id, username, email, avatar FROM users WHERE id = ?";

        
        const [rows] = await connection.query(query, [userId]);

        if (rows.length === 0) {
            
            return res.status(404).json({ error: true, message: "User is not found" });
        }

        
        req.user = rows[0];
        next(); 
    } catch (error) {
        console.log(error);
        
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(400).json({ error: true, message: "Invalid token" });
        }
        return res.status(500).json({ error: true, message: "Something went wrong, please try again later", debug: error.message });
    }
};

module.exports = verifyToken;