const rabbit = require('./service');

rabbit.connect("amqp://guest:guest@localhost/").then(conn=>{
    console.log("Connected");
})
