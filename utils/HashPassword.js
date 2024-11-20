const bcrypt = require("bcryptjs");



const hashPassword = (password) => {
    if(!password){
        throw new Error("Password must be provided");
    }

    const rounds = 10;

    const passwordHash = bcrypt.hash(password , rounds);

    return passwordHash;
}

module.exports = hashPassword;