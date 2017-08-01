const amqp = require('amqplib');

let serverUri = null;
let channel = null;
let connection = null;
let prefetchCount = 1000;
const messageHandlersData = [];
const offlinePubQueue = [];

const publishOfflineMessage = () => {
    while (true) {
        const m = offlinePubQueue.shift();
        if (!m) break;
        send(m.exchange, m.routingKey, m.message);
    }
    return Promise.resolve({ connection, channel });
}

const handleChannelCreated = (ch) => {
    channel = ch;
    channel.prefetch(prefetchCount);
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
        onMessage(data.exchange, data.queueName, data.routingKey, data.messageHandler,data.config);
    });
}

const connect = (server,prefetch=1) => {
    if (!prefetchCount) prefetchCount = prefetch;
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
                    console.error(`[AMQP] error - ${new Date()}`);
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
            console.error(`[AMQP] error - ${new Date()}`);
            console.error(err);
            reconnect();
        })
}

const disconnect = () => {
    serverUri = null;
    if (connection) {
        connection.removeListener('close', handleReconnection);
        connection.close();
    }
    messageHandlersData.length=0;
    offlinePubQueue.length=0;
    connection = null;
    channel = null;
}

const send = (exchange, routingKey, message) => {
    try {
        return new Promise((resolve, reject) => {
            channel.publish(exchange, routingKey, new Buffer(message), { persist: false }, (err, ok) => {
                if (err) {
                    console.error("[AMQP] publish", err);
                    offlinePubQueue.push({ exchange, routingKey, content });
                    connection.close();
                    reject(err);
                }
                resolve();
            });
        });
    }
    catch (err) {
        console.error(err)
        offlinePubQueue.push({ exchange, routingKey, message });
        connection.close();
        return Promise.reject(err);
    }
}


const onMessage = (exchange, queueName, routingKey, messageHandler, queueConfigs) => {
    const config = queueConfigs?queueConfigs: {
        noAck:true,
        autoDelete:false,
        durable:true
    }
    channel.assertQueue(queueName, config).then((q) => {
        channel.bindQueue(q.queue, exchange, routingKey);
        channel.consume(q.queue, (msg) => {
            if (typeof messageHandler.then == 'function') {
                messageHandler(msg).then(r => { if (!config.noAck) channel.ack(msg); });
            }
            else{
                messageHandler(msg);
                if (!config.noAck) channel.ack(msg);
            }
        }, config);
        if (!messageHandlersData.find(a => a.exchange === exchange && a.queueName === queueName && a.routingKey === routingKey && a.messageHandler === messageHandler && a.config === config)) messageHandlersData.push({ exchange,queueName, routingKey, messageHandler,config});
    }).catch(err => { console.error(err) })
}


module.exports = {
    connect,
    send,
    disconnect,
    onMessage
}