import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import {
    Router, Request, Response, Error,
} from 'express';
import apiUser, {ApiSchema} from '../models/apikey';
import VerifyToken from './VerifyToken';

interface QueryUser {
    name?: string,
    fname?: string,
    id_place?: string
    email?: string
}

const findUser = (req: Request, res: Response) => {
    const query = <QueryUser>{};
    query.email = req.body.email;
    apiUser.find(query, (err: Error, user) => {
        if (err) return res.status(500).send('There was a problem finding the user.');
        if (user.length) return res.status(400).send('Email already used');
    });
};

const createUser = (req: Request, res: Response, hashedPassword: any) => {
    apiUser.create(
        {
            name: req.body.name,
            email: req.body.email,
            api_key: hashedPassword,
            creation: Date.now(),
        },
        (err: Error, user) => {
            if (err) {
                return res
                    .status(500)
                    .send('There was a problem registering the user.');
            }

            // create a token
            const token = jwt.sign({id: user._id}, process.env.API_SECRET);

            res.status(200).send({auth: true, token});
        },
    );
};

const isValidPassword = (req, user: ApiSchema) => bcrypt.compareSync(
    req.body.password,
    user.api_key,
);

const Auth = (router: Router) => {
    /** POST /register */

    router.post('/register', (req: Request, res: Response) => {
        if (
            req.body.name === null
            || req.body.email === null
            || req.body.password === null
        ) res.status(400).send('invalid mail or name');

        findUser(req, res);

        const hashedPassword = bcrypt.hashSync(req.body.password, 8);

        createUser(req, res, hashedPassword);
    });

    /** GET /me */

    router.get('/me', VerifyToken, (req: Request, res: Response, next) => {
        apiUser.findById(req.userId, {api_key: 0}, (err: Error, user: ApiSchema) => {
            if (err) return res.status(500).send('There was a problem finding the user.');
            if (!user) return res.status(404).send('No user found.');

            res.status(200).send(user);
        });
    });

    /** POST /login */

    router.post('/login', (req: Request, res: Response) => {
        apiUser.findOne({email: req.body.email}, (err: Error, user: ApiSchema) => {
            if (err) return res.status(500).send('Error on the server.');
            if (!user) return res.status(404).send('No user found.');

            const passwordIsValid = isValidPassword(req, user);

            if (!passwordIsValid) return res.status(401).send({auth: false, token: null});

            const token = jwt.sign({id: user._id}, process.env.API_SECRET);

            res.status(200).send({auth: true, token});
        });
    });

    /** GET /logout */

    router.get('/logout', (req: Request, res: Response) => {
        res.status(200).send({auth: false, token: null});
    });
};

export default Auth;
