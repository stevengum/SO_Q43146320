const restify = require('restify');
const builder = require('botbuilder');
const LuisAppId = require('./config.js').LuisAppId;
const LuisAPIKey = require('./config.js').LuisAPIKey;

const model = 'https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/' + LuisAppId + '?subscription-key=' + LuisAPIKey;

var server = restify.createServer();

server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});

var connector = new builder.ChatConnector({

    appId: process.env.MICROSOFT_APP_ID,

    appPassword: process.env.MICROSOFT_APP_PASSWORD

});

server.post('/api/messages', connector.listen());

var bot = new builder.UniversalBot(connector);
var recognizer = new builder.LuisRecognizer(model);
var intents = new builder.IntentDialog({ recognizers: [recognizer] });
bot.dialog('/', intents);

intents.matches('builtin.intent.alarm.set_alarm', '/set_alarm')

bot.dialog('/set_alarm', [
    function (session, args, next) {
        if (session.message) {
            console.log('===\n1st waterfall step, session.message object found:');
            console.log(session.message);
        } else {
            console.log('session.message object not found.');
        }

        if (args) {
            console.log('===\nargs object found:');
            console.log(args);
        }

        var title = builder.EntityRecognizer.findEntity(args.entities, 'builtin.alarm.title');
        var time = builder.EntityRecognizer.resolveTime(args.entities);
        var alarm = session.dialogData.alarm = {
            title: title ? title.entity : null,
            timestamp: time ? time.getTime() : null
        };
        if (!alarm.title) {
            builder.Prompts.text(session, 'What would you like to call your alarm?');
        } else {
            next();
        }
    },
    function (session, results, next) {
        if (session.message) {
            console.log('===\n2nd waterfall step, session.message object found:');
            console.log(session.message);
        } 
        var alarm = session.dialogData.alarm;
        if (results.response) {
            alarm.title = results.response;
        }

        if (alarm.title && !alarm.timestamp) {
            builder.Prompts.time(session, 'What time would you like to set the alarm for?');
        } else {
            next();
        }
    },
    function (session, results) {
        var alarm = session.dialogData.alarm;
        if (results.response) {
            var time = builder.EntityRecognizer.resolveTime([results.response]);
            alarm.timestamp = time ? time.getTime() : null;
        }
        if (alarm.title && alarm.timestamp) {
            alarm.address = session.message.address;
            alarms[alarm.title] = alarm;

            var date = new Date(alarm.timestamp);
            var isAM = date.getHours() < 12;
            session.send('Creating alarm named "%s" for %d/%d/%d %d:%02d%s',
                alarm.title,
                date.getMonth() + 1, date.getDate(), date.getFullYear(),
                isAM ? date.getHours() : date.getHours() - 12, date.getMinutes(), isAM ? 'am' : 'pm');
        } else {
            session.send('Ok... no problem.');
        }
    }
]).cancelAction('/cancelCreateAlarm','Canceling alarm creation.', { matches: /^cancel/i, confirmPrompt: 'Cancel making an alarm?' });

intents.matches('builtin.intent.alarm.delete_alarm', [
    function (session, args, next) {
        var title;
        var entity = builder.EntityRecognizer.findEntity(args.entities, 'builtin.alarm.title');
        if (entity) {
            title = builder.EntityRecognizer.findBestMatch(alarms, entity.entity);
        }

        if (!title) {
            builder.Prompts.choice(session, 'Which alarm would you like to delete?', alarms);
        } else {
            next({ response: title });
        }
    },
    function (session, results) {
        if (results.response) {
            delete alarms[results.response.entity];
            session.send("Deleted the '%s' alarm.", results.response.entity);
        } else {
            session.send('Ok... no problem.');
        }
    }
]);

intents.onDefault(builder.DialogAction.send("I'm sorry I didn't understand. I can only create & delete alarms."));

// Very simple alarm scheduler
var alarms = {};
setInterval(function () {
    var now = new Date().getTime();
    for (var key in alarms) {
        var alarm = alarms[key];
        if (now >= alarm.timestamp) {
            var msg = new builder.Message()
                .address(alarm.address)
                .text("Here's your '%s' alarm.", alarm.title);
            bot.send(msg);
            delete alarms[key];
        }
    }
}, 15000);

