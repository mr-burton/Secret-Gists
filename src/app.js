/* eslint-disable no-console */

require('dotenv').config();
const fs = require('fs');
const bodyParser = require('body-parser');
const express = require('express');
const octokit = require('@octokit/rest');
const nacl = require('tweetnacl');
nacl.util = require('tweetnacl-util');

const username = 'mr-burton'; // TODO: Replace with your username
// The object you'll be interfacing with to communicate with github
const github = octokit({ debug: true });
const server = express();

// Create application/x-www-form-urlencoded parser
const urlencodedParser = bodyParser.urlencoded({ extended: false });

// Generate an access token: https://github.com/settings/tokens
// Set it to be able to create gists
github.authenticate({
  type: 'oauth',
  token: process.env.GITHUB_TOKEN
});

// TODO:  Attempt to load the key from config.json.  If it is not found, create a new 32 byte key.
let secretKey;

try {
  // reading data from config file
  const data = fs.readFileSync('./config.json');
  // Parsing data that is read from the config file
  const keyObject = JSON.parse(data);
  // Decoding data from the base 64 to the UTF8
  secretKey = nacl.util.decodeBase64(keyObject.secretKey);
} catch (err) {
  // secret key generator so we have one saved to the config file
  secretKey = nacl.randomBytes(32);
  // creating key object
  const keyObject = { secretKey: nacl.util.encodeBase64(secretKey) };
  // Writing data to config file stringifying the object
  fs.writeFile('./config.json', JSON.stringify(keyObject), (ferr) => {
    if (ferr) {
      console.log('error writing secretKey to config file: ', ferr.message);
      return;
    }
  });
}

// const secretKey = nacl.randomBytes(32);

server.get('/', (req, res) => {
  // Return a response that documents the other routes/operations available
  res.send(`
    <html>
      <header><title>Secret Gists!</title></header>
      <body>
        <h1>Secret Gists!</h1>
        <div>This is an educational implementation.  Do not use for truly valuable information</div>
        <h2>Supported operations:</h2>
        <ul>
          <li><i><a href="/keyPairGen">Show Keypair</a></i>: generate a keypair from your secret key.  Share your public key for other users of this app to leave encrypted gists that only you can decode with your secret key.</li>
          <li><i><a href="/gists">GET /gists</a></i>: retrieve a list of gists for the authorized user (including private gists)</li>
          <li><i><a href="/key">GET /key</a></i>: return the secret key used for encryption of secret gists</li>
        </ul>
        <h3>Set your secret key to a specific key</h3>
        <form action="/setkey:keyString" method="get">
          Key String: <input type="text" name="keyString"><br>
          <input type="submit" value="Submit">
        </form>
        <h3>Create an *unencrypted* gist</h3>
        <form action="/create" method="post">
          Name: <input type="text" name="name"><br>
          Content:<br><textarea name="content" cols="80" rows="10"></textarea><br>
          <input type="submit" value="Submit">
        </form>
        <h3>Create an *encrypted* gist for yourself</h3>
        <form action="/createsecret" method="post">
          Name: <input type="text" name="name"><br>
          Content:<br><textarea name="content" cols="80" rows="10"></textarea><br>
          <input type="submit" value="Submit">
        </form>
        <h3>Retrieve an *encrypted* gist you posted for yourself</h3>
        <form action="/fetchmessagefromself:id" method="get">
          Gist ID: <input type="text" name="id"><br>
          <input type="submit" value="Submit">
        </form>
        <h3>Create an *encrypted* gist for a friend to decode</h3>
        <form action="/postmessageforfriend" method="post">
          Name: <input type="text" name="name"><br>
          Friend's Public Key String: <input type="text" name="publicKeyString"><br>
          Content:<br><textarea name="content" cols="80" rows="10"></textarea><br>
          <input type="submit" value="Submit">
        </form>
        <h3>Retrieve an *encrypted* gist a friend has posted</h3>
        <form action="/fetchmessagefromfriend:messageString" method="get">
          String From Friend: <input type="text" name="messageString"><br>
          <input type="submit" value="Submit">
        </form>
      </body>
    </html>
  `);
});

server.get('/keyPairGen', (req, res) => {
  // TODO:  Generate a keypair from the secretKey and display both
  // grab the keypair from the secret key
  // Display both keys as strings
  const keypair = nacl.box.keyPair.fromSecretKey(secretKey);
  res.send(`
    <html>
      <header><title>Keypair</title></header>
      <body>
        <h1>Keypair</h1>
        <div>Share your public key with anyone you want to be able to leave you secret messages.</div>
        <div>Keep your secret key safe.  You will need it to decode messages.  Protect it like a passphrase!</div>
        <br/>
        <div>Public Key: ${nacl.util.encodeBase64(keypair.publicKey)}</div>
        <div>Secret Key: ${nacl.util.encodeBase64(keypair.secretKey)}</div>
      </body>
    </html>
  `);
});

server.get('/gists', (req, res) => {
  // Retrieve a list of all gists for the currently authed user
  github.gists.getForUser({ username })
    .then((response) => {
      res.json(response.data);
    })
    .catch((err) => {
      res.json(err);
    });
});

server.get('/key', (req, res) => {
  // TODO: Display the secret key used for encryption of secret gists
  res.send(nacl.util.encodeBase64(secretKey));
});

server.get('/setkey:keyString', (req, res) => {
  // TODO: Set the key to one specified by the user or display an error if invalid
  const keyString = req.query.keyString;
  try {
    // TODO:
    secretKey = nacl.util.decodeUTF8(keyString);
    const keyObject = { secretKey: keyString };
    fs.writeFile('./config.json', JSON.stringify(keyObject), (ferr) => {
      if (ferr) {
        console.log('Error writing secret key to config file: ', ferr.message);
        return;
      }
    });
    res.send(`<div>Key set to new value: ${keyString}</div>`);
  } catch (err) {
    // run this catch block if failed
    res.send('Failed to set key. Key string appears invalid.');
  }
});

server.get('/fetchmessagefromself:id', (req, res) => {
  // TODO:  Retrieve and decrypt the secret gist corresponding to the given ID
  const id = req.query.id;
  github.gist
    .get({ id })
    .then((response) = {
      const gist = response.data;
      // If gist has only 1 file we only care about that file
      const filename = Object.keys(gist.files)[0];
      const blob = gist.files[filename].content;
      // here we assume nonce is the first 24 bytes of blob, split and decrypt remainder
      // N.B.
      const nonce = nacl.util.decodeBase64(blob.slice(0, 32));
      const ciphertext = nacl.util.decodeBase64(blob.slice(32, blob.length));
      const plaintext = nacl.secretbox.open(cipher, nonce, secretKey);
      res.send(nacl.util.encodeUTF8(plaintext));
    })
    .catch((err) => {
      console.log(err)
    });
});

server.post('/create', urlencodedParser, (req, res) => {
  // Create a private gist with name and content given in post request
  const { name, content } = req.body;
  const files = { [name]: { content } };
  github.gists.create({ files, public: false })
    .then((response) => {
      res.json(response.data);
    })
    .catch((err) => {
      res.json(err);
    });
});

server.post('/createsecret', urlencodedParser, (req, res) => {
  // TODO:  Create a private and encrypted gist with given name/content
  // NOTE - we're only encrypting the content, not the filename
  const keypair = nacl.box.keypair.fromSecretKey(secretKey);
  const { name, publicKeyString, content } = req.body;
  const nonce = nacl.randomBytes(24);
  const ciphertext = nacl.box(nacl.util.decodeUTF8(content), nonce,
    nacl.util.decodeBase64(publicKeyString), secretKey);
  // to save we need to keep both encrypted content and nonce
  const blob = nacl.util.encodeBase64(nonce) +
    nacl.util.encodeBase64(ciphertext);
  const files = { [name]: { content: blob } };
  github.gist.create({ files, public: true })
    .then((response) => {
      // Display a string that is the messengers public key + encrypted message blob
      // to share with the friend.
      const messageString = nacl.util.encodeBase64(keypair.publicKey) + response.data.id;
      res.send('
        < html >
        <header><title>Message Saved</title></header>
        <body>
          <h1>Message Saved</h1>
          <div>Give this string to your friend for decoding.</div>
          <div>${messageString}</div>
        </body>
          </html >
        ');
    })
    .catch((err) => {
      res.json(err);
  })
});

server.post('/postmessageforfriend', urlencodedParser, (req, res) => {
  // TODO:  Create a private and encrypted gist with given name/content
  // using someone else's public key that can be accessed and
  // viewed only by the person with the matching private key
  // NOTE - we're only encrypting the content, not the filename
  const keypair = nacl.box.keypair.fromSecretKey(secretKey);
  const { name, publicKeyString, content } = req.body;
  const nonce = nacl.randomBytes(24);
  const ciphertext = nacl.box(nacl.util.decodeUTF8(content), nonce,
    nacl.util.decodeBase64(publicKeyString), secretKey);
  // to save we need to keep both encrypted content and nonce
  const blob = nacl.util.encodeBase64(nonce) +
    nacl.util.encodeBase64(ciphertext);
  const files = { [name]: { content: blob } };
  github.gist.create({ files, public: true })
    .then((response) => {
      // Display a string that is the messengers public key + encrypted message blob
      // to share with the friend.
      const messageString = nacl.util.encodeBase64(keypair.publicKey) + response.data.id;
      res.send('
        < html >
        <header><title>Message Saved</title></header>
        <body>
          <h1>Message Saved</h1>
          <div>Give this string to your friend for decoding.</div>
          <div>${messageString}</div>
        </body>
          </html >
        ');
    })
    .catch((err) => {
      res.json(err);
    })
});

server.get('/fetchmessagefromfriend:messageString', urlencodedParser, (req, res) => {
  // TODO:  Retrieve and decrypt the secret gist corresponding to the given ID
  const messageString = req.query.messageString;
  const friendPublicString = messageString.slice(0, 44);
  const id = messageString.slice(44, messageString.length);
  github.gist.get({ id })
    .then((response) => {
      const gist = response.data;
      // if gist has only 1 file we only care about that file
      const filename = Object.keys(gist.files)[0];
      const blob = gist.files[filename].content;
      // if nonce is the first 24 bytes of blob, split and decrypt remainder
      //  N.B.
      const nonce = nacl.util.decodeBase64(blob.slice(0, 32));
      const ciphertext = nacl.util.decodeBase64(blob.slice(32, blob.length));
      const plaintext = nacl.box.open(ciphertext, nonce,
        nacl.util.decodeBase64(friendPublicString), secretKey);
      res.send(nacl.util.encodeUTF8(plaintext));
    })
});

/* OPTIONAL - if you want to extend functionality */
server.post('/login', (req, res) => {
  // TODO log in to GitHub, return success/failure response
  // This will replace hardcoded username from above
  // const { username, oauth_token } = req.body;
  res.json({ success: false });
});

/*
  Still want to write code? Some possibilities:
  - Pretty templates! More forms!
  - Better management of gist IDs, use/display other gist fields
  - Support editing/deleting existing gists
  - Switch from symmetric to asymmetric crypto
  - Exchange keys, encrypt messages for each other, share them
  - Let the user pass in their private key via POST
*/

server.listen(3000);


// initial commit going over docs and implementation

server.listen(3000, () => console.log('listening on port 3000'));
