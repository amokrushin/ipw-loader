'use strict';

var async = require( 'async' ),
    request = require( 'request' ),
    jwt = require( 'jsonwebtoken' ),
    spawn = require( 'cross-spawn-async' ),
    child = require( 'child_process' ),
    logger = require( './lib/logger' ),
    nconf = require( 'nconf' ),
    uuid = require( 'node-uuid' ),
    sigInt = false;

nconf.file( {file: 'config.json'} );

function requestSettings( config, callback ) {
    async.waterfall( [
        function( callback ) {
            var apiKeyId = config.apiKey.slice( 0, 40 ),
                apiKeySecret = config.apiKey.slice( 40, 80 ),
                token = jwt.sign( {apiKeyId: apiKeyId}, apiKeySecret, {
                    expiresIn: '60s'
                } );
            callback( null, token );
        },
        function( token, callback ) {
            request( {
                url: config.host + config.apiEndpoint,
                headers: {
                    'Authorization': token
                },
                json: true
            }, function( err, res, body ) {
                if( err ) return logger.error( err );
                if( res.statusCode !== 200 ) return logger.error( 'HTTP' + res.statusCode, res.body );
                callback( null, body );
            } );
        }
    ], callback );
}

function ipwVersion( callback ) {
    var process = spawn( 'npm', ['list', '-json', '--depth=0'] ),
        stdout = '',
        stderr = '';
    process.stdout.on( 'data', function( data ) {
        stdout += data;
    } );
    process.stderr.on( 'data', function( data ) {
        stderr += data;
    } );
    process.on( 'close', function() {
        if( stderr ) logger.error( stderr );
        try
        {
            var list = JSON.parse( stdout );
            if( !list.dependencies.ipw ) return callback();
            callback( null, list.dependencies.ipw.version || null );
        } catch( err )
        {
            if( err ) return callback( err );
        }
    } );
}

function ipwInstall( ver, callback ) {
    var repo = 'https://github.com/amokrushin/ipw.git',
        url = repo + '#v' + ver,
        process = spawn( 'npm', ['i', url] ),
        stdout = '',
        stderr = '';
    process.stdout.on( 'data', function( data ) {
        stdout += data;
    } );
    process.stderr.on( 'data', function( data ) {
        stderr += data;
    } );
    process.on( 'close', function() {
        if( stderr ) logger.error( stderr );
        callback( null, stdout );
    } );
}

function forkIpw( config, settings ) {
    logger.info( 'Fork Image processing worker...' );
    var ipw = child.fork( './node_modules/ipw/app.js' );
    ipw.send( {
        msg: 'uuid',
        content: config.uuid
    } );
    ipw.send( {
        msg: 'settings',
        content: settings
    } );

    return ipw;
}

function ipwUpdate( requiredVersion, callback ) {
    ipwVersion( function( err, installedVersion ) {
        if( err ) return callback( err );
        if( installedVersion === requiredVersion ) return callback();
        if( !installedVersion )
        {
            logger.info( 'Image processing worker is not installed, required v' + requiredVersion );
            logger.info( 'Image processing worker installing...' );
        }
        else
        {
            logger.info( 'Image processing worker v' + installedVersion + ', required v' + requiredVersion );
            logger.info( 'Image processing worker updating...' );
        }
        ipwInstall( requiredVersion, function( err ) {
            if( err ) return callback( err );
            logger.info( 'Image processing worker v' + requiredVersion + ' installed' );
            return callback();
        } );
    } );
}

function startIpw( config ) {
    async.waterfall( [
        async.apply( requestSettings, config ),
        function( settings, callback ) {
            var requiredVersion = settings.ipw.version;
            if( !requiredVersion ) return callback( 'required IPW version is not defined' );
            ipwUpdate( requiredVersion, function( err ) {
                if( err ) return callback( err );
                callback( null, settings );
            } )
        }
    ], function( err, settings ) {
        if( err ) return logger.error( err );
        var ipw = forkIpw( config, settings );
        ipw.on( 'exit', function() {
            if( !sigInt ) startIpw( config );
        } );
    } );
}

process.once( 'SIGINT', function() {
    sigInt = true;
    logger.info( 'SIGINT' );
    setTimeout( function() {
        logger.info( 'EXIT' );
        process.exit();
    }, 1000 );
} );

async.waterfall( [
    nconf.load.bind( nconf ),
    function( config, callback ) {
        if( !config.uuid ) nconf.set( 'uuid', uuid.v1() );
        nconf.save( function( err ) {
            if( err ) return logger.error( err );
            callback( null, config );
        } );
    },
    startIpw
] );
