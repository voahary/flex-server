import mongoose from 'mongoose';
import dbconfig from './database/mongoDB';
import socketio from "socket.io";
import placesCollection from "./models/place"

import app, { router, listOfRoutes } from './app';

const DEFAULT_URI: string | undefined = dbconfig.getMongoUri(); //  get the URI from config file

const DEFAULT_PORT: number = 3000;

try {
    mongoose.connect(
        DEFAULT_URI,
        { useNewUrlParser: true },
    ).catch(err => console.log(err));
} catch (err) {
    console.log(err);
}

const server = app.listen(process.env.PORT || DEFAULT_PORT, () => {
    const port = server.address().port;
    console.log('App now running on port : ', port);
});

const websocket = socketio(server);

let pool = new Array();

websocket.on('connect', (socket) => {
    socket.on('joinRoom', room => socket.join(room));
    socket.on('leaveRoom', room => socket.leave(room));
    socket.on('checkPlace', place => {
        const index = pool.indexOf(place);
        if (index > -1) {
            socket.emit('leavePlace');
            pool.splice(index, 1);
        }
        else
            socket.join(place);
    });
});

listOfRoutes(router, websocket, pool);