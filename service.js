const amqp = require('amqplib');

let serverUri = null;
let channel = null;
let connection = null;
const messageHandlersData = [];
const offlinePubQueue = [];

const publishOfflineMessage = () => {
    while (true) {
        const m = offlinePubQueue.shift();
        if (!m) break;
        send(m.exchange, m.topic, m.message);
    }
    return Promise.resolve({ connection, channel });
}

const handleChannelCreated = (ch) => {
    channel = ch;
    return channel;
}

const handleConnected = (conn) => {
    connection = conn;
    connection.on("error", onError);
    connection.on("close", handleReconnection);
    return conn.createConfirmChannel();
}

const onError = (err) => {
    if (err.message !== "Connection closing") {
        console.error("[AMQP] conn error", err.message);
    }
}
const handleReconnection = () => {
    console.error("[AMQP] reconnecting");
    return setTimeout(reconnect, 1000);
}

const reconnect = () => {
    if (connection) {
        connection.removeListener('close', handleReconnection);
    }
    connection = null;
    channel = null;
    connect(serverUri);
}

const reAttachMessageHandlers = () => {
    messageHandlersData.forEach(data => {
        onMessage(data.exchange, data.queueName, data.topic, data.messageHandler,data.config);
    });
}

const connect = (server) => {
    if (!serverUri) serverUri = server;
    if (connection) {
        if (channel) {
            return Promise.resolve({ connection, channel })
        }
        else {
            return connection.createConfirmChannel()
                .then(handleChannelCreated)
                .then(publishOfflineMessage)
                .then(reAttachMessageHandlers).catch(err => {
                    console.error(`#### Houve um erro! ${new Date()}`);
                    console.error(err);
                    reconnect();
                });
        }
    }
    return amqp.connect(serverUri)
        .then(handleConnected)
        .then(handleChannelCreated)
        .then(publishOfflineMessage)
        .then(reAttachMessageHandlers).catch(err => {
            console.error(`#### Houve um erro! ${new Date()}`);
            console.error(err);
            reconnect();
        })
}

const disconnect = () => {
    console.log("Disconnecting...")
    serverUri = null;
    if (connection) {
        connection.removeListener('close', handleReconnection);
        connection.close();
    }
    connection = null;
    channel = null;
    console.log("Disconnected!")
}

const send = (exchange, topic, message) => {
    try {
        console.log(`Tópico da mensagem: ${topic}`);
        console.log(`Mensagem enviada para MQ: ${message}`);
        return new Promise((resolve, reject) => {
            channel.publish(exchange, topic, new Buffer(message), { persist: false }, (err, ok) => {
                if (err) {
                    console.error("[AMQP] publish", err);
                    offlinePubQueue.push({ exchange, topic, content });
                    connection.close();
                    reject(err);
                }
                resolve();
            });
        });
    }
    catch (err) {
        console.error(err)
        offlinePubQueue.push({ exchange, topic, message });
        connection.close();
        return Promise.reject(err);
    }
}


const onMessage = (exchange, queueName, topic, messageHandler, queueConfigs) => {
    const config = queueConfigs?queueConfigs: {
        noAck:true,
        autoDelete:false,
        durable:true
    }
    channel.assertQueue(queueName, config).then((q) => {
        channel.bindQueue(q.queue, exchange, topic);
        channel.consume(q.queue, (msg) => {
            messageHandler(msg).then(r => { if (!config.noAck) channel.ack(msg); });
        }, config);
        if (!messageHandlersData.find(a => a.exchange === exchange && a.queueName === queueName && a.topic === topic && a.messageHandler === messageHandler && a.config === config)) messageHandlersData.push({ exchange,queueName, topic, messageHandler,config});
    })
        .catch(err => { console.error(err) })
}


module.exports = {
    connect,
    send,
    disconnect,
    onMessage
}