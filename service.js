const amqp = require('amqplib');

let serverUri = null;
let channel = null;
let connection = null;
let prefetchCount = 1;
const messageHandlersData = [];
const offlinePubQueue = [];

const publishOfflineMessage = () => {
    if(!channel) Promise.reject(`Channel is null.`);
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
    channel.on("error", onError);
    channel.on("close", handleReconnection);
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
    handleReconnection();
}
const handleReconnection = () => {
    console.error("[AMQP] reconnecting");
    return setTimeout(reconnect, 5000);
}

const cleanUp = () => {
    if (channel) {
        channel.removeListener('close', handleReconnection);
        channel.removeListener('error',onError);
        try {
            channel.close();
        } catch (err) {
            console.error("[AMQP] Could not close the channel. Is it already closed?");
        }
    }
    if (connection) {
        connection.removeListener('close', handleReconnection);
        connection.removeListener('error',onError);
        try {
            connection.close();
        }
        catch (err) {
            console.error("[AMQP] Could not close the connection. Is it already closed?");
        }
    }

    connection = null;
    channel = null;
}

const reconnect = () => {
    cleanUp();
    connect(serverUri, prefetchCount);
}

const reAttachMessageHandlers = () => {
    messageHandlersData.forEach(data => {
        onMessage(data.exchange, data.queueName, data.routingKey, data.messageHandler, data.config);
    });
    return Promise.resolve();
}

const connect = (server, prefetch = 1) => {
    if (prefetchCount !== prefetch) prefetchCount = prefetch;
    if (!serverUri) serverUri = server;

    if (connection) {
        if (channel) {
            return Promise.resolve(connection)
        }
    }
    const promise = connection ? handleConnected(connection) : amqp.connect(serverUri).then(handleConnected);
    return promise
        .then(handleChannelCreated)
        .then(publishOfflineMessage)
        .then(reAttachMessageHandlers)
        .then(() => {
            return Promise.resolve(connection);
        })
        .catch(err => {
            console.error(`[AMQP] error - ${new Date()}`);
            console.error(err);
            handleReconnection();
        })
}

const disconnect = () => {
    serverUri = null;
    if (connection) {
        connection.removeListener('close', handleReconnection);
        connection.close();
    }
    messageHandlersData.length = 0;
    offlinePubQueue.length = 0;
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
    const config = queueConfigs ? queueConfigs : {
        noAck: true,
        autoDelete: false,
        durable: true
    }
    channel.assertQueue(queueName, config).then((q) => {
        channel.bindQueue(q.queue, exchange, routingKey);
        channel.consume(q.queue, (msg) => {
            const msgResult = messageHandler(msg);
            if (msgResult && typeof msgResult.then === 'function') {
                msgResult.then(r => { if (!config.noAck) channel.ack(msg); });
            }
            else {
                if (!config.noAck) channel.ack(msg);
            }
        }, config);
        if (!messageHandlersData.find(a => a.exchange === exchange && a.queueName === queueName && a.routingKey === routingKey && a.messageHandler === messageHandler && a.config === config)) messageHandlersData.push({ exchange, queueName, routingKey, messageHandler, config });
    }).catch(err => { console.error(err) })
}


module.exports = {
    connect,
    send,
    disconnect,
    onMessage
}