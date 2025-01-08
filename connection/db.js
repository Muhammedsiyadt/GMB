require('dotenv').config();
var mysql = require('mysql2');

const connection = mysql.createPool({
  host: 'localseo123.czqggwwuq80e.us-east-1.rds.amazonaws.com',
  user: 'locasleo',
  password: 'localseo123',
  database: 'localseo',
  port: 3306 ,
  connectTimeout: 100000,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
}).promise();



module.exports = connection; 