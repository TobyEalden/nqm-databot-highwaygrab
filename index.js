/**
 * GPS grab and store:
 * @param {Object} tdx Api object.
 * @param {Object} output functions.
 * @param {Object} packageParams of the databot.
 */

function GrabHighway(tdxApi,output,packageParams){
    "use strict"
  let options = {
    string:true,
    local: false
  }
  //fs.rmdirSync(path.join(__dirname,"*-imgs"));
  var req = function(){
    var cameraArray = [];
    /*
      array timestamp each time req() is called
     */
    let timestamp = Date.now();

    return tdxApi.getDatasetDataAsync(packageParams.cameraTable, null, null, null)
      .then((response) => {
        output.debug("Retrived data length is "+response.data.length);
        return Promise.all(_.map(response.data,(val,i) => {
          try{
            fs.readdirSync(path.join(__dirname,String(val.ID)+"-imgs"));
          }catch(e){
            fs.mkdirSync(path.join(__dirname,String(val.ID)+"-imgs"));
          }
          return base64.encodeAsync(val.src,options)
          .then((result) => {
            var cameraObj = {
              ID:val.ID,
              DictIndex:timestampArray.length>(packageParams.imgLength-1)?(packageParams.imgLength-1):timestampArray.length,
              timestamp:timestamp,
              base64String:result
            }
            return (cameraObj);
          })
          .catch((err) => {
            output.debug("catch err with base64 %s",err);
          })
        }))
      })
      .then((result) => {
        var updateArray = [];
        _.forEach(result,(val) => {
          cameraArray.push(val);
          var fileName = val.ID+"-"+val.timestamp+"-"+"img.jpg";
          var pathName = path.join(__dirname,path.join(String(val.ID)+"-imgs",fileName));
          var filesArray = fs.readdirSync(path.join(__dirname,String(val.ID)+"-imgs"));
          if(timestampArray.length >= packageParams.imgLength){
            var unlinkIndex = timestampArray[0];
            timestampArray.shift();
            output.debug("timestampArray length is"+timestampArray.length);
            if(unlinkIndex != undefined){
              fs.unlinkSync(path.join(__dirname,path.join(String(val.ID)+"-imgs",String(val.ID)+"-"+unlinkIndex+"-img.jpg")));
            }
          }
          /*
            writeSync to file system
          */
          fs.writeFileSync(pathName,val.base64String,{encoding:"base64"});
        });
        /*
          updateArray eliminate base64String
         */
        updateArray = _.map(cameraArray,(o) => {
          o = _.omit(o,"base64String");
          return o;
        })
        output.debug("get cameraArray length is "+ updateArray.length);
        timestampArray.push(timestamp);
        output.debug("timestampArray length is"+timestampArray.length);
        return tdxApi.updateDatasetDataAsync(packageParams.cameraLive,updateArray,true);
      })
      .catch((err) => {
        output.debug("get dataset data err "+err);
      })
  }
  var computing = false;

  var timer = setInterval(() => {
    if(!computing){
      computing = true;
      output.debug("now computing is "+computing);
      req().then((result) => {
        output.debug(result);
        computing = false;
      });
    }
  },packageParams.timerFrequency);
}

/**
 * Main databot entry function:
 * @param {Object} input schema.
 * @param {Object} output functions.
 * @param {Object} context of the databot.
 */
function databot(input, output, context) {
    "use strict"
    output.progress(0);

    var tdxApi = new TDXAPI({
        commandHost: context.commandHost,
        queryHost: context.queryHost,
        accessTokenTTL: context.packageParams.accessTokenTTL
    });

    Promise.promisifyAll(tdxApi);
    const restify = require('restify');

    const server = restify.createServer();

    server.use(restify.acceptParser(server.acceptable));
    server.use(restify.queryParser());
    server.use(restify.bodyParser());

    server.get("/",function(req,res,next){
      res.send("localhost:3003");
    })

    server.get('/img/:folder/:timestampIndex', function (req, res, next) {

      var folderName = req.params.folder;
      var timestampValue = timestampArray[req.params.timestampIndex];
      output.debug("length of timestampArray is "+timestampArray.length);
      output.debug(timestampValue);
      if(timestampValue){
        var fileName = folderName+"-"+timestampValue+"-img.jpg";
        var filePath = path.join(__dirname,path.join(folderName+"-imgs",fileName));

        output.debug("get file %s",filePath);

        var readStream = fs.createReadStream(filePath,{encoding:"base64"});
        var stat = fs.statSync(filePath);
        var imgfile = new Buffer(fs.readFileSync(filePath),"base64");
        var sendObj = {
          ID:folderName,
          timestamp:timestampValue,
          base64String: imgfile
        }
        res.writeHead(200, {
          'Content-Type':'application/json',
          'Content-Length': JSON.stringify(sendObj).length     
        });
        res.end(JSON.stringify(sendObj));
      }else{
        res.end("NO IMAGE");
      }
      //output.debug(readStream);
      //readStream.pipe(res);
    });

    server.listen(context.instancePort);

    tdxApi.authenticate(context.shareKeyId, context.shareKeySecret, function (err, accessToken) {
        if (err) {
            output.debug("%s", JSON.stringify(err));
            process.exit(1);
        } else {
            GrabHighway(tdxApi, output, context.packageParams);
        }
    });
}


var request = require("request-promise");
var TDXAPI = require("nqm-api-tdx");
var _ = require("lodash");
var base64 = require("node-base64-image");
var fs = require("fs");
var Promise = require("bluebird");
var path = require("path");
var timestampArray = [];

// var tdxAPI = new TdxApi(TDXconfig);
// Promise.promisifyAll(tdxAPI);
Promise.promisifyAll(base64);

if (process.env.NODE_ENV == 'test') {
    // Requires nqm-databot-trafficgrab.json file for testing
    input = require('./databot-test.js')(process.argv[2]);
} else {
    // Load the nqm input module for receiving input from the process host.
    input = require("nqm-databot-utils").input;
}

// Read any data passed from the process host. Specify we're expecting JSON data.
input.pipe(databot);
