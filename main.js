const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const client = new Client({ authStrategy: new LocalAuth() });

let chatList = null;
let phoneLists = { };

function load()
{
	let filepath = path.join(__dirname, 'config.json');
	if (!fs.existsSync(filepath)) return;

	let data = JSON.parse(fs.readFileSync(filepath));

	if ('phoneLists' in data)
		phoneLists = data.phoneLists;
}

function save()
{
	let filepath = path.join(__dirname, 'config.json');

	fs.writeFileSync(filepath, JSON.stringify({
		phoneLists
	}));
}

function prompt (message)
{
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve, reject) => {
		rl.question(message, (line) => {
			rl.close();
			resolve(line);
		});
	});
}

function Phone (value)
{
	if (value[0] === '#')
		value = chatList[~~value.substr(1)].id.user;

	value = value.replace(/\D/g, '');
	if (value.length > 8) return value;

	return '504' + value;
}

const commands =
{
	'help': function()
	{
		console.log('  '+`
  * clear                              Clears the console.
  * chats                              Shows a list of available chats.
  * groups                             Shows a list of available groups.
  * group-members <name|idx>           Shows the members of a group.
  * send <phone> <message>             Sends a message to the specified phone number.
  * lists                              Shows the registered lists of phone numbers.
  * list-add <list-name> <phone...>    Adds one or more phone numbers to a list.
  * list-rem <list-name> <phone...>    Removes one or more phone numbers from a list.
  * list-show <list-name>              Shows the phone numbers in a list.
  * list-del <list-name>               Deletes a list.
  * list-send <list-name> <message>    Sends a message to all phone numbers in the list.

		`.trim());
	},

	'clear': function()
	{
		console.clear();
	},

	'chats': async function()
	{
		chatList = await client.getChats();
		for (let idx in chatList)
		{
			const chat = chatList[idx];
			if (chat.isGroup) continue;

			if (chat.unreadCount)
				console.log(`  ${idx}: ${chat.name} (${chat.unreadCount})`);
			else
				console.log(`  ${idx}: ${chat.name}`);
		}
	},

	'groups': async function()
	{
		chatList = await client.getChats();
		for (let idx in chatList)
		{
			const chat = chatList[idx];
			if (!chat.isGroup) continue;

			console.log(`  ${idx}: ${chat.name} [${chat.groupMetadata.size}] (${chat.unreadCount})`);
		}
	},

	'group-members': async function(args, line)
	{
		if (args.length < 2) throw new Error('  Use: group-members <group-name>');

		let name = line.substr(line.indexOf(' ')+1);

		for (let idx in chatList)
		{
			const chat = chatList[idx];
			if (!chat.isGroup) continue;

			if (name[0] === '#' && idx != name.substr(1))
				continue;

			if (name[0] !== '#' && name != chat.name)
				continue;

			let s = '';
			let n = 0;

			for (let x of chat.participants)
			{
				s += x.id.user.padStart(13, ' ') + (x.isSuperAdmin ? '!' : (x.isAdmin ? '*' : ' '));
				if (++n == 6) {
					s += '\n';
					n = 0;
				}
			}

			console.log(s);
			break;
		}
	},

	'lists': async function()
	{
		for (let idx in phoneLists) {
			console.log(`  ${idx}: ${phoneLists[idx].length}`);
		}
	},

	'list-add': async function(args)
	{
		if (args.length < 3) throw new Error('  Use: list-add <list-name> <phone...>');

		if (!(args[1] in phoneLists))
			phoneLists[args[1]] = [];

		let list = phoneLists[args[1]];

		let skipped = 0;
		let added = 0;

		for (let i = 2; i < args.length; i++)
		{
			args[i] = Phone(args[i]);

			if (list.indexOf(args[i]) === -1) {
				list.push(args[i]);
				added++;
			}
			else
				skipped++;
		}

		if (skipped)
			console.log(`  Added ${added} new phones to ${args[1]}, and skipped ${skipped} duplicated.`)
		else
			console.log(`  Added ${added} new phones to ${args[1]}.`);

		save();
	},

	'list-rem': async function(args)
	{
		if (args.length < 3) throw new Error('  Use: list-rem <list-name> <phone...>');

		if (!(args[1] in phoneLists)) {
			console.log(`  List \`${args[1]}\` does not exist.`);
			return;
		}

		let list = phoneLists[args[1]];

		let removed = 0;

		for (let i = 2; i < args.length; i++)
		{
			let j = list.indexOf(Phone(args[i]));
			if (j === -1) continue;

			list.splice(j, 1);
			removed++;
		}

		console.log(`  Removed ${removed} phones from ${args[1]}.`);
		save();
	},

	'list-show': async function(args)
	{
		if (args.length < 2) throw new Error('  Use: list-show <list-name>');

		if (!(args[1] in phoneLists)) {
			console.log(`  List \`${args[1]}\` does not exist.`);
			return;
		}

		let s = '';
		let n = 0;

		for (let phone of phoneLists[args[1]])
		{
			s += phone.padStart(14, ' ');
			if (++n == 6) {
				s += '\n';
				n = 0;
			}
		}

		console.log(s);
	},

	'list-del': async function(args)
	{
		if (args.length < 2) throw new Error('  Use: list-del <list-name>');

		if (!(args[1] in phoneLists)) {
			console.log(`List \`${args[1]}\` does not exist.`);
			return;
		}

		delete phoneLists[args[1]];
		console.log('List successfully deleted.');
	},

	'list-send': async function(args, line)
	{
		if (args.length < 3) throw new Error('  Use: list-send <list-name> <message>');

		if (!(args[1] in phoneLists)) {
			console.log(`List \`${args[1]}\` does not exist.`);
			return;
		}

		line = line.substr(line.indexOf(' ', line.indexOf(' ')+1)+1);

		let m = phoneLists[args[1]].length;
		let n = 0;

		for (let phone of phoneLists[args[1]])
		{
			console.log('  [' + (++n) + '/' + m + '] Sending to ' + phone + ' ...');

			try {
				await client.sendMessage(phone+'@c.us', line);
			}
			catch (e) {
				console.log('  Error: ' + e.message);
			}
		}

		console.log('  Done');
	},

	'send': async function(args, line)
	{
		if (args.length < 3) throw new Error('  Use: send <phone> <message>');

		line = line.substr(line.indexOf(' ', line.indexOf(' ')+1)+1);

		try {
			await client.sendMessage(Phone(args[1])+'@c.us', line);
			console.log('Message sent.');
		}
		catch (e) {
			console.log('Error: ' + e.message);
		}
	}
};

async function main()
{
	console.clear();
	console.log('WhatsApp interface ready!');
	console.log('Type `help` to get a list of commands available.');
	console.log('');

	load();

	while (true)
	{
		let line = (await prompt('>> ')).trim();

		if (line === 'exit') {
			process.exit();
			break;
		}

		if (!line) continue;

		let args = line.split(' ').map(x => x.trim());
		if (!(args[0] in commands)) {
			console.log('Error: Unknown command: ' + args[0]);
			continue;
		}

		console.log('');

		try {
			await commands[args[0]] (args, line);
		}
		catch (e) {
			console.log(e.message);
		}

		console.log('');
	}
}

client.on('qr', (qr) => {
	qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
	main();
});

client.initialize();
