# amqp-connection

Connect easily on AMQP and retry connections on errors. Publish buffered offline messages on connection.

## Install

```
$ npm install --save amqp-connection
```

## API

The module exposes 4 methods:

* connect(connectionString)
* send(exchange,routingKey,message)
* onMessage(exchange, queueName, routingKey, messageHandler, queueConfigs)
* disconnect()


### connect(connectionString)

Use this to connect to an message queue server (ex: RabbitMQ).

Params:

* connectionString [string] - The server's connection string. Ex: 'amqp://user:password@lazy-turkey.com/d'.

Return:

* connection [Object] - The server's connection object. This is the object created on **amqplib**'s connect method;

### send(exchange,routingKey,message)

Publish the message on the specified *exchange* with the *routingKey*. If the connection is not available on publish, it buffers and try to publish the message on reconnection.

Params:

* exchange [string] - the exchange name;
* routingKey [string] - the routing key of the message;
* message [string] - the content of the published message.

### onMessage(exchange, queueName, routingKey, messageHandler, queueConfigs)

Pass a *messageHandler* function to handle messages publushed on the specified *exchange* and *queueName*.

Params:

* exchange [string] - the exchange name;
* queueName [strng] - the queue name;
* routingKey [string] - the routing key;
* messageHandler [function] - the function which will handle the incoming messages;
* queueConfigs [object] - the object with the queue configuration;
* queueConfigs.autoDelete [boolean] - if *true*, the queue will be deleted when no one is binded to the queue;
* queueConfigs.noAck [boolean] - if *true*, *message acknowledges* will not be sent to the AMQP server; restart.

### disconnect()

Disconnect from the server, removes all the *messageHandlers* assigned by the *onMessage* function and clears out the unpublished offline messages.

## License

The MIT License (MIT)

Copyright (c) 2022 anishihara

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.