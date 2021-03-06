import User from "../models/user";
import Place from "../models/place";
import cloudinary from "cloudinary";

/**
 * This function adds a new user.
 * @param {string} id_user id of the new user
 * @param {string} name name of the new user
 * @param {string} fname first name of the new user
 */
export function addUser(
    id_user: string,
    name: string,
    fname: string
) {
    const user = new User();
    user.id = id_user;
    user.name = name;
    user.fname = fname;

    return user.save()
    .then((user, err) => {
        if (err) console.log(err);
        else console.log("User created");
    });
}

/**
 * This function updates an existing user.
 * @param {string} id_user id of the user
 * @param {object} params list of fields to be updated
 */
export function updateUser(
    id_user: string,
    params
) {
    User.updateOne({ id: id_user }, params, (err: Error) => {
        if (err) console.log(err);
        console.log("User updated");
    })
}

/**
 * This function updates several existing users.
 * @param {object} conditions conditions for the users to be updated (e.g. { id: "foo" })
 * @param {object} params list of fields to be updated
 */
export function updateManyUsers(
    conditions,
    params
) {
    User.updateMany(conditions, params, (err: Error) => {
        if (err) console.log(err);
        console.log("Updated users matching condition " + JSON.stringify(conditions, null, 2));
    })
}

/**
 * This function is used to get a user document from the database.
 * @param id_user the id of the user
 * @returns an object containing the fields of the user if found, else null
 */
export const getUserById = (id_user: string) => User.findOne({ id: id_user });

/**
 * This function is used to get all the users from the database.
 * @returns an array containing objects with the fields of the users
 */
export const getUsers = () => User.find({});

/**
 * This function states whether a user is already registered in the database,
 * based on their id.
 * @param id_user the id of the user
 */
export async function userExists(
    id_user: string
) {
    const user = await getUserById(id_user);
    if (user) return true;
    return false;
}

/**
 * This function uploads and then updates a user's photo
 * @param id_user id of the user
 * @param photo base64 image
 */
export async function updatePhoto(
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
export function uploadPhoto(photo) {
    return cloudinary.uploader
        .upload("data:image/jpeg;base64," + photo)
        .then(result => result.secure_url)
        .catch(error => console.log(error));
}

/**
 * This function checks if the info entered when logging in match
 * the info saved in the database.
 * @param user the user from the database
 * @param info the user entered in login form
 */
export function matchUserInfo(
    user,
    info
) {
    return user.fname === info.fname && user.name === info.name;
}

/**
 * This function adds a new place.
 * @param {string} id_place id of the new place
 * @param {boolean} using whether the place must be set as used or not
 * @param {string} id_user id of the user in case the place is set as used
 */
export function addPlace(
    id_place: string,
    using = false,
    id_user = ""
) {
    const place = new Place()
    place.id = id_place;
    place.using = using;
    place.id_user = id_user;

    return place.save()
    .then((place, err: Error) => {
        if (err) console.log(err);
        console.log("Place created");
    });
}

/**
 * This function updates an existing place.
 * @param {string} id_place id of the place
 * @param {object} params list of fields to be updated
 */
export function updatePlace(
    id_place: string | object, // should only be string, will be fixed
    params
) {
    Place.updateOne({ id: id_place }, params, (err: Error) => {
        if (err) console.log(err);
        console.log("Place updated");
    })
}

    /**
 * This function is used to get a place document from the database.
 * @param id_place the id of the place
 * @returns an object containing the fields of the place if found, else null
 */
export const getPlaceById = (id_place: string) => Place.findOne({ id: id_place });

/**
 * This function is used to get all the places from the database.
 * @returns an array containing objects with the fields of the places
 */
export const getPlaces = () => Place.find({});

/**
 * This function is used to know if a place exists and who uses it.
 * @param {string} id_place id of the current place
 */
export async function whoUses(id_place: string) {
    const place = await getPlaceById(id_place);
    if (place) return place.id_user; // will return "" if not used, or user's id if used
    return "#";
}

/**
 * This function is used to set all the places to free
 * and all the users to not seated.
 * @param websocket the sockets to use to make the connection between client and server
 * @param {Array<string>} pool the pool array to fill in case a user is disconnected
 */
export async function resetPlaces(websocket, pool: Array<string>) {
    //Updates all used places
    const places = await getPlaces(); // get every place from database
    const length = places.length;

    for (let index = 0; index < length; index++) { // for each place
        const place = places[index];
        if (place.using === true) {
            // If the user of the place is connected,
            // the sockects room doesn't exist meaning that
            // userConnected will be undefined.
            // Else, it will be an object.
            const userConnected = websocket.sockets.adapter.rooms[place.id];
            if (userConnected)
                websocket.in(place.id).emit('leavePlace');
            else {
                pool.push(place.id_user);
                updateUser(place.id_user, { pool: true });
                console.log(`User ${place.id_user} added to pool`);
            }
            updatePlace(place.id, { using: false, id_user: "" }); // set the place free
        }
    }

    //Update all seated users
    updateManyUsers({ id_place: { $ne: "" } }, { id_place: "" });
}

/**
 * This function is used to get all the users of the database's pool.
 * @returns an array of string containing the id of the users
 */
export const getPooledUsers = () => User.find({ pool: true }).then(pooledUsers => pooledUsers.map(pooledUser => pooledUser.id));