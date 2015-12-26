var winston = require( 'winston' );

var logger = new (winston.Logger)( {
    transports: [
        new (winston.transports.Console)( {
            formatter: function( options ) {
                var timestamp = new Date().toISOString().replace( /T/, ' ' ).replace( /\..+/, '' ),
                    pid = process.pid;
                var message = timestamp + ' [' + pid + '] - ' + options.level + ': ';
                if( options.meta instanceof Error )
                {
                    message += options.meta.message;
                    message += '\n\t' + options.meta.stack;
                }
                else
                {
                    message += undefined !== options.message ? options.message : '';
                    if( options.meta && Object.keys( options.meta ).length )
                    {
                        message += '\n\t' + JSON.stringify( options.meta );
                    }

                }
                return message;
            }
        } )
    ]
} );

module.exports = logger;