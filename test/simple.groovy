// camel-k: language=groovy

from('timer:tick')
  .setBody().constant('hello')
  .log('${body} world!')
