/* eslint-disable */

import {
	pick,
	last,
	append,
	update,
	findLastIndex,
	propEq,
	filter
} from "ramda";

import { Request, Response, Error, Router } from "express";
import User, { UserSchema } from "../models/user";
import Place, { PlaceSchema } from "../models/place";
import VerifyToken from "./VerifyToken";
import { encrypt, decrypt } from "./test";
import cloudinary from "cloudinary";

const HTTPS_REGEX = "^https?://(.*)";

const errorMessages = {
	userCreation: "Error creating the user",
	userFind: "Error finding the user",
	userUpdate: "Error updating the user",
	userIdMatch: "User's ID not matching user's info",
	placeCreation: "Error creating the place",
	placeFind: "Error finding the place",
	placeUpdate: "Error updating the place",
	invalidArguments: "Invalid arguments"
}

const resultCodes = {
	success: 200,
	syntaxError: 400,
	serverError: 500
}

interface Request {
	userId?: string | Buffer | DataView;
	body: any;
}

let RES;

const post = (router: Router) => {
	
	/**
	 * This function adds a new user.
	 * @param {string} id_user id of the new user
	 * @param {string} name name of the new user
	 * @param {string} fname first name of the new user
	 */
	function addUser(
		id_user: string,
		name: string,
		fname: string
	) {
		const user = new User();
		user.id = id_user;
		user.name = name;
		user.fname = fname;
	
		user.save((err: Error) => {
			if (err) RES.status(resultCodes.serverError).send(errorMessages.userCreation);
			console.log("User created");
		});
	}

	/**
	 * This function updates an existing user.
	 * @param {string} id_user id of the user
	 * @param {object} params list of fields to be updated
	 */
	function updateUser(
		id_user: string,
		params
	) {
		User.updateOne({ id: id_user }, params, (err: Error) => {
			if (err) console.log(err);
			console.log("User updated");
		})
	}
	
	/**
	 * This function uploads and then updates a user's photo
	 * @param id_user id of the user
	 * @param photo base64 image
	 */
	async function updatePhoto(
		id_user: string,
		photo: string
	) {
		const url = await uploadPhoto(photo);
		updateUser(id_user, { photo: url });
	}
	
	/**
	 * This function uploads a photo and returns its url
	 * @param photo base64 image
	 * @returns the url of the uploaded image
	 */
	function uploadPhoto(photo) {
		return cloudinary.uploader
			.upload("data:image/jpeg;base64," + photo)
			.then(result => result.secure_url)
			.catch(error => console.log(error));
	}

	/**
	 * This function adds a new place.
	 * @param {string} id_place id of the new place
	 */
	function addPlace(
		id_place: string
	) {
		const place = new Place()
		place.id = id_place;
	
		place.save((err: Error) => {
			if (err) RES.status(resultCodes.serverError).send(errorMessages.placeCreation);
			console.log("Place created");
		});
	}

	/**
	 * This function updates an existing place.
	 * @param {string} id_place id of the place
	 * @param {object} params list of fields to be updated
	 */
	function updatePlace(
		id_place: string | object, // should only be string, will be fixed
		params
	) {
		Place.updateOne({ id: id_place }, params, (err: Error) => {
			if (err) console.log(err);
			console.log("Place updated");
		})
	}

	/**
	 * This function is used to get a user document from the database.
	 * @param id_user the id of the user
	 * @returns an object containing the fields of the user if found, else null
	 */
	 const getUserById = (id_user: string) => User.findOne({ id: id_user }).then(user => user);

	 /**
	 * This function is used to get a place document from the database.
	 * @param id_place the id of the place
	 * @returns an object containing the fields of the place if found, else null
	 */
	const getPlaceById = (id_place: string) => Place.findOne({ id: id_place }).then(place => place);

	/**
	 * This function states whether a user is already registered in the database,
	 * based on their id.
	 * @param id_user the id of the user
	 */
	async function userExists(
		id_user: string
	) {
		const user = await getUserById(id_user);
		if (user) return true;
		return false;
	}

	/**
	 * This function checks if the info entered when logging in match
	 * the info saved in the database.
	 * @param user the user from the database
	 * @param info the user entered in login form
	 */
	function matchUserInfo(
		user,
		info
	) {
		if (user.fname !== info.fname || user.name !== info.name) return false;
		return true;
	}

	/**
	 * This function is used to know if a place exists and who uses it.
	 * @param {string} id_place id of the current place
	 */
	async function whoUses(id_place: string) {
		const place = await getPlaceById(id_place);
		if (place) return place.id_user; // will return "" if not used, or "name" if used by name
		return "#";
	}

	/**
	 * This function is used to know where the provided user is seated.
	 * @param {string} id_place id of the current user
	 */
	async function whereSit(id_user: string) {
		return await new Promise((resolve, reject) => {
			User.findOne(
				{ id: id_user },
				null,
				{ sort: { _id: -1 } },
				(err: Error, user: UserSchema) => {
					if (err) RES.status(resultCodes.serverError).send(errorMessages.userFind);
					else if (user !== null) {
						const userEnd =
							user.historical.length > 0
								? pick(["end"], last(user.historical))
								: "";
						if (userEnd.end === "") resolve(user.id_place);
						else resolve("");
					}
					else resolve("#");
				}
			);
		});
	}

	/**
	 * This function handle all the post requests.
	 * @param {object} body current payload of the request
	 */
	async function post(body) {
		const userSit = await whereSit(body.id_user);
		const user = await whoUses(body.id_place);
		if (body.id_place !== "") {
			if (userSit === "#" || userSit === "") {
				const beginDate: string = new Date(Date.now()).toLocaleString();
				if (user === "#") {
					//  not exists or not sit
					console.log("NOT EXISTS");
					updateUser(body.id_user, {
						id_place: body.id_place,
						historical: append(
							{ place_id: body.id_place, begin: beginDate, end: "" },
							body.historical
						),
						name: body.name,
						fname: body.fname,
						remoteDay: body.remoteDay || null,
						photo: body.photo || ""
					});
					//  not exists
					console.log("PLACE NOT EXISTS");
					addPlace(body.id_place); // here the place is not set as used, will be fixed next commit
				} else if (user === "") {
					updateUser(body.id_user, {
						id_place: body.id_place,
						historical: append(
							{ place_id: body.id_place, begin: beginDate, end: "" },
							body.historical
						),
						name: body.name,
						fname: body.fname,
						remoteDay: body.remoteDay || null,
						photo: body.photo || ""
					});
					//  place empty
					console.log("EMPTY PLACE");
					updatePlace(body.id_place, {
						using: true,
						id_user: body.id_user
					});
				} //  used by the "user" user
				else {
					console.log(`PLACE USED BY: ${user}`);
					const userUsedName = await User.findOne(
						{ id: user },
						(err: Error, placeUser) => {
							return placeUser;
						}
					);
					return await userUsedName.name;
				}
			} else {
				console.log("SIT");
				if (userSit === body.id_place) {
					const indexUser = findLastIndex(propEq("place_id", body.id_place))(
						body.historical
					);
					// user already sit here and leaves
					const endDate = new Date(Date.now()).toLocaleString();
					updateUser(body.id_user, {
						historical: update(
							indexUser,
							{
								place_id: body.id_place,
								begin: body.historical[indexUser].begin,
								end: endDate
							},
							body.historical
						),
						id_place: "",
						name: body.name,
						fname: body.fname,
						remoteDay: body.remoteDay || null,
						photo: body.photo || ""
					});
					updatePlace(body.id_place, { using: false, id_user: "" });
				} //  user is sit somewhere and move to another place
				else {
					const endDate = new Date(Date.now()).toLocaleString();
					const indexUser = findLastIndex(propEq("place_id", body.id_place))(
						body.historical
					);
					updateUser(body.id_user, {
						historical: update(
							indexUser,
							{
								place_id: body.id_place,
								begin: body.historical[indexUser].begin,
								end: endDate
							},
							body.historical
						),
						name: body.name,
						fname: body.fname,
						remoteDay: body.remoteDay || null,
						photo: body.photo || null
					}); //  the other user leaves
					updatePlace(userSit, { using: false, id_user: "" }); // updates the old user place
					updatePlace(body.id_place, {
						using: true,
						id_user: body.id_user
					}); //  the user is now here
				}
			}
		} else {
			updateUser(body.id_user, {
				historical: body.historical,
				name: body.name,
				fname: body.fname,
				remoteDay: body.remoteDay,
				photo: body.photo
			});
		}
	}

	/**
	 * This route handle all the post requests.
	 */
	router
		.route("/")

		.post(VerifyToken, (req: Request, res: Response) => {
			RES = res;
			const body = req.body;

			if (
				body.id_place === null ||
				body.name === null ||
				body.fname === null ||
				body.id_user === null
			)
				return RES.status(resultCodes.syntaxError).send(errorMessages.invalidArguments);

			body.id_user = encrypt(body.id_user, req.userId);
			body.name = encrypt(body.name, req.userId);
			body.fname = encrypt(body.fname, req.userId);
			post(body).then(element => {
				element && typeof element === "string"
					? RES.status(resultCodes.success).json({
							body: decrypt(element, req.userId)
						})
					: RES.status(resultCodes.success).json({ result: "User Updated" });
			});
		});

	/**
	 * This route is used to handle users login.
	 */
	router
		.route("/login_user")

		.post(VerifyToken, async (req: Request, res: Response) => {
			const body = req.body;
			if (
				body.name === null ||
				body.fname === null ||
				body.id_user === null ||
				body.id_user.match(process.env.LOGIN_REGEX) === null
			)
				return res.status(resultCodes.syntaxError).json(errorMessages.invalidArguments);
			body.id_user = encrypt(body.id_user, req.userId);
			body.name = encrypt(body.name, req.userId);
			body.fname = encrypt(body.fname, req.userId);

			if (await userExists(body.id_user)) {
				const user = await getUserById(body.id_user);
				if (await matchUserInfo(user, body)) res.status(resultCodes.success).send({ user: user });
				else res.status(resultCodes.serverError).send(errorMessages.userIdMatch);
			}

			else {
				addUser(body.id_user, body.name, body.fname);
				res.status(resultCodes.success).json({ result: "User Added" });
			}
		});

	/**
	 * This route is used to add a friend.
	 */
	router
		.route("/add_friend")

		.post(VerifyToken, (req: Request, res: Response) => {
			const body = req.body;
			RES = res;
			const id_user = encrypt(body.id_user, req.userId);

			User.findOne(
				{ id: id_user },
				null,
				{ sort: { _id: -1 } },
				(err: Error, user) => {
					if (err) RES.status(resultCodes.syntaxError).send(errorMessages.userFind);
					else if (user) {
						user.friend = append(
							{
								id: body.id,
								name: body.name,
								fname: body.fname,
								id_place: body.id_place,
								photo: body.photo
							},
							user.friend
						);
						user.save((err: Error) => {
							if (err) RES.status(resultCodes.serverError).send(errorMessages.userUpdate);
							RES.status(resultCodes.success).send({ user });
						});
					}
				}
			);
		});

	/**
	 * This route is used to remove a friend.
	 */
	router
		.route("/remove_friend")

		.post(VerifyToken, (req: Request, res: Response) => {
			const body = req.body;
			RES = res;
			const id_user = encrypt(body.id_user, req.userId);

			User.findOne(
				{ id: id_user },
				null,
				{ sort: { _id: -1 } },
				(err: Error, user) => {
					if (err) RES.status(resultCodes.syntaxError).send(errorMessages.userFind);
					else if (user) {
						const isRemovedUser = userFriend => userFriend.id !== body.id;
						user.friend = filter(isRemovedUser, user.friend);
						user.save((err: Error) => {
							if (err) RES.status(resultCodes.serverError).send(errorMessages.userUpdate);
							RES.status(resultCodes.success).send({ user });
						});
					}
				}
			);
		});

	router
		.route("/settings_user")

		.post(VerifyToken, (req: Request, res: Response) => {
			const body = req.body;
			const id_user = encrypt(body.id_user, req.userId);

			if (
				body.photo &&
				body.photo.match(HTTPS_REGEX) === null &&
				(body.photo !== "" || body.photo !== null)
			) updatePhoto(id_user, body.photo);
			
			if (body.remoteDay !== "") updateUser(id_user, { remoteDay: body.remoteDay });
			res.status(resultCodes.success).send({success: "success"});
		});
};

export default post;
