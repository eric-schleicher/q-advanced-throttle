/**
 * Copyright: Eric Schleicher <eric (at) brilligents (dot) com>
 *
 * Extended from the great work that Christoph Dorn <christoph@christophdorn.com> did creating this in the first place.  Thank him
 * License: MIT
 * Original Source: https://gist.github.com/1725325
 * 
 * Source for this (q-advanced-throttle) https://github/com/eric-schleicher/q-advanced-throttle
 *
 * NodeJS Example:
 *
 *     // Requirements: `npm install q`
 *
 *     var Q = require("q");
 *
 *     // Require this module (to add `Q.Throttle` to the `Q` API)
 *     Q.Throttle = require("q-advanced-throttle").Throttle;
 *
 *     // Maximum of 3 unresolved promises at a time
 *     var throttle = Q.Throttle(3);
 *
 *     for (var i=0 ; i < 10 ; i++) {
 *         throttle.when([i], function(i) {
 *             // Never more than 3 unresolved doDeferredWork() promises
 *             return doDeferredWork(i).then(function() {
 *             });
 *         });
 *     }
 *
 *     throttle.on("done", function(){
 *     });
 *     
 *     throttle.on("error", function(){
 *     });
 *
 *     throttle.on("progress", function(){
 *     });
 *
 */

function log(message){
    if (loggingVerbose===true){
        console.log(message);
    }
}

var loggingVerbose = true,
    Q = require("q"),
    EVENTS = require("events");

var Throttle = exports.Throttle = function(max){
    if (!max){
        throw new Error("You cannot throttle with concurrency of 0");
    }

    if (!(this instanceof Throttle))
        return new Throttle(max);
    this.heapSize = 0;
    this.iteration = 0;
    this.count = 0;
    this.buffer = [];
    this.max = max;
    this.outcomes={
        fulfilled:[],
        rejected:[]
    };
};

Throttle.prototype = new EVENTS.EventEmitter();

Throttle.prototype.when = function(args, func)
{
    // todo modify this so that an packaged array of all arguments an function calls can be provided all at once.
    // this way the total number of calls can be known from the outset of the throttles activities

    //todo consider an alternate style where the throttle is 'loaded' and then run/executed.
    var self = this,
        result;

    if (self.count >= self.max)
    {
        self.buffer.push([args, func]);
        return;
    }
    //the total number of items ever added
    self.heapSize += 1;

    //really the current number left
    self.count += 1;

    result = func.apply(null, args);

    if (!Q.isPromise(result))
    {
        throw new Error("Throttled function call did not return a promise!");
    }

    result.then(
        //success
        function(fulfilledResult){
            // provide the result to throttle object
            self.outcomes.fulfilled.push(fulfilledResult);
            throttleProgress();
        },
        //failures
        function(rejectedResult){
            // provide the result to throttle object
            self.outcomes.rejected.push(rejectedResult);
            throttleProgress();
        }
    );

    function throttleProgress(){
        //increment the progress iterator
        self.iteration+=1;
        log("iteration " + self.iteration +  " of " + self.heapSize +  " [" + func.name +"]");
        if (self.outcomes.rejected.length+self.outcomes.fulfilled.length===self.heapSize){
            //console.log("we would emit the completed event now");
            self.emit("done", self.outcomes);
            return;
        }
        self.emit("progress", self.outcomes);
    }

    function throttleCycle(){
        //decrements the counter
        self.count -= 1;

        //console.log("inflight check:");
        //console.log(self.heapSize === self.outcomes.fulfilled.length + self.outcomes.rejected.length);

        if (self.buffer.length > 0)
        {
            //if there is work
            var info = self.buffer.shift();
            self.when(info[0], info[1]);
        }
        else if (self.count === 0)
        {
            //self.emit("done", self.outcomes);
        }
        else{
            throw new Error("Unhandled error condition; unexpected combination of values for throttle buffer and throttle count")
        }
    }

    Q.when(result,
        //success
        function(result){
            throttleCycle();
        },
        //failure
        function(err)   {
            throttleCycle();
            self.emit("error", {error:err,results:self.outcomes});
        });
};


/*
* TEST
* 
*/

exports.Throttle_Test = function()
{
    // We require the Q.js library
    var Q = require('q');
    
    // Create the throttle from variable defined above 
    Q.Throttle = Throttle;
    
    //A few helper functions for the test
    var utils = (function(){
        return {
            random:{
                boolean:function randomBoolean(){
                    return Math.random()<.5; // Readable, Succinct
                },
                integer:function randomIntegerArbitrary(floor, ceiling){
                    floor = floor | 1;
                    if (!ceiling)
                        console.warn("no ceiling value for random integer provided, value set to 10000");
                    ceiling = ceiling || 10000;
                    return Math.floor(Math.random() * (ceiling - floor)) + floor;
                } 
            }
        }
    }());

    //=-=-=-=-=--=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    //         SOME OPTIONS
    //=-=-=-=-=--=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

    // Require this module (to add `Q.Throttle` to the `Q` API)
    var failRandomly = false;
    var echoOutcomes = true;
    var concurrency = 3;

    function asyncTestFunction(value, minDelay, maxDelay){
        var deferredWork =Q.defer();
        setTimeout(function(){
            if (!failRandomly || utils.random.boolean()){
                deferredWork.resolve(value);
            }
            else{
                deferredWork.reject(value);
            }
        }, utils.random.integer(minDelay||0,maxDelay||500));
        return deferredWork.promise;
    }

    // set the maximum # of unresolved promises at a time
    var throttle = Q.Throttle(concurrency);

    //simple iteration example
    for (var i=0 ; i < 10 ; i++) {
        throttle.when([i, 1000,1000], asyncTestFunction);
    }

    //=-=-=-=-=--=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    //         EVENTS EXAMPLES
    //=-=-=-=-=--=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    var eventVerbosity = {
        progress: false,
        error: false,
        done: true
    };
    
    throttle.on("done", function(outcomes){
        if(eventVerbosity.done)
            console.log("done!");

        if(echoOutcomes)
            console.log(outcomes);
    });

    throttle.on("error", function(outcomes){
        if(eventVerbosity.error)
            console.log("an error was emitted");
    });

    throttle.on("progress", function(outcomes){
        if(eventVerbosity.progress)
            console.log("a progress event was emitted");
    });
};
