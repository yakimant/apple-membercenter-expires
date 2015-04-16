var utils = require('utils');
var fs = require('fs');

var select_team_page = 'https://developer.apple.com/membercenter/selectTeam.action';
var distrib_certs_page = 'https://developer.apple.com/account/ios/certificate/certificateList.action?type=distribution';
var distrib_profiles_page = 'https://developer.apple.com/account/ios/profile/profileList.action?type=production';
var prog_summary_page = 'https://developer.apple.com/membercenter/index.action#progSummary';

var casper = require('casper').create({
  pageSettings: {
    // loadImages:  false,
    // loadPlugins: false
  },
  // logLevel: "debug",
  // verbose: true
});

casper.on('remote.message', function(msg) {
  this.echo('remote message caught: ' + msg);
});

// casper.on("resource.error", function(resourceError){
//   console.log('Unable to load resource (#' + resourceError.id + 'URL:' + resourceError.url + ')');
//   console.log('Error code: ' + resourceError.errorCode + '. Description: ' + resourceError.errorString);
// });

casper.start();

configFile = fs.read('./config.json');
casper.then(function() {
    config = JSON.parse(configFile);
});

casper.thenOpen(select_team_page, function(response) {
  this.fillSelectors('form#command', {
    'input[name="appleId"]':          config.appleid,
    'input[name="accountPassword"]':  config.password
  }, true);
});

var teams;

casper.then(function() {
  teams = this.evaluate(function() {
    var teams = [];
    var team_nodes = document.querySelectorAll('#teams option');
    for (var i = 0; i < team_nodes.length; i++) {
      teams.push({
        'id': team_nodes[i].value,
        'name': team_nodes[i].innerHTML
      });
    }
    return teams;
  });
});

var certs = {};

casper.then(function() {
  this.each(teams, function(self, team) {
    this.thenOpen(select_team_page, function(response) {
      this.fillSelectors('form#saveTeamSelection', {
        'select[name="memberDisplayId"]':  team.id,
      }, true);
      this.thenOpen(distrib_certs_page, function(response) {
        var certs_data = this.evaluate(function() {
          var certs_data = [];
          var cert_name_nodes = document.querySelectorAll('#grid-table td[aria-describedby="grid-table_name"]');
          var cert_type_nodes = document.querySelectorAll('#grid-table td[aria-describedby="grid-table_typeString"]');
          var cert_expires_nodes = document.querySelectorAll('#grid-table td[aria-describedby="grid-table_expirationDateString"]');
          var name, type, expires;
          for (var i = 0; i < cert_name_nodes.length; i++) {
            name = cert_name_nodes[i].innerHTML;
            type = cert_type_nodes[i].innerHTML;
            var expiration_date = new Date(cert_expires_nodes[i].innerHTML);
            expires = expiration_date.toDateString();
            var diff = expiration_date - Date.now();
            var daysDiff = Math.ceil(diff / (1000 * 3600 * 24));
            certs_data.push({
              'name': name,
              'type': type,
              'expires': expires,
              'expires_in': daysDiff
            });
          }
          return certs_data;
        });
        certs[team.id] = certs_data;
      });
    });
  });
});

var profiles = {};

casper.then(function() {
  this.each(teams, function(self, team) {
    this.thenOpen(select_team_page, function() {
      this.fillSelectors('form#saveTeamSelection', {
        'select[name="memberDisplayId"]':  team.id,
      }, true);
      this.thenOpen(distrib_profiles_page, function() {
        this.waitForSelector('#grid-table', function() {
          var team_profiles = this.evaluate(function() {
            var team_profiles = [];
            var result_names =  document.querySelectorAll('#grid-table td[aria-describedby="grid-table_name"]');
            var result_types =  document.querySelectorAll('#grid-table td[aria-describedby="grid-table_type"]');
            var result_statuses =  document.querySelectorAll('#grid-table td[aria-describedby="grid-table_status"]');
            for (var i=0;i<result_names.length;i++) {
              team_profiles.push({
                'name': result_names[i].getAttribute('title'),
                'type': result_types[i].getAttribute('title'),
                'status': result_statuses[i].getAttribute('title')
              });
            }
            return team_profiles;
          });
          profiles[team.id] = [];
          this.eachThen(team_profiles, function(response) {
            var team_profile = response.data;
            var name = team_profile['name'];
            var type = team_profile['type'];
            var status = team_profile['status'];
            if (type == 'iOS Distribution' || type == 'iOS UniversalDistribution') {
              this.evaluate(function(){
                $('#grid-table tr td[tabindex=1]').remove();
              });
              this.click('#grid-table td[title="' + name + '"]');
              this.capture(team.id + '_' + name + '_opened_profiles.png');
              var expires = this.evaluate(function() {
                return document.querySelector('#grid-table dd.dateExpire').innerHTML;
              });
              var expiration_date = new Date(expires);
              var diff = expiration_date - Date.now();
              var daysDiff = Math.ceil(diff / (1000 * 3600 * 24));
              profiles[team.id].push({
                'name': name,
                'type': type,
                'status': status,
                'expires': expiration_date.toDateString(),
                'expires_in': daysDiff
              });
            }
          });
        }, function() {
          this.capture(team.id + '_timeout.png');
          this.echo('FATAL: Timeout for ' + team.id);
        });
      });
    });
  });
});

var programs = {};
casper.then(function() {
  this.each(teams, function(self, team) {
    this.thenOpen(select_team_page, function(response) {
      this.waitForSelector('form#saveTeamSelection', function() {
        this.fillSelectors('form#saveTeamSelection', {
          'select[name="memberDisplayId"]':  team.id,
        }, true);
        this.thenOpen(prog_summary_page, function() {
          this.waitForSelector('.programs', function() {
            var team_programs = this.evaluate(function() {
              var program_names = document.querySelectorAll('.programs h4');
              var program_expires = document.querySelectorAll('.programs p');
              var team_programs = [];
              for (var i = 0;i < program_names.length;i++) {
                var expires_match = /^Expiration Date: (.+)$/.exec(program_expires[i].innerHTML);
                if (expires_match != null) {
                  var expiration_date = new Date(expires_match[1]);
                  var diff = expiration_date - Date.now();
                  var daysDiff = Math.ceil(diff / (1000 * 3600 * 24));
                  team_programs.push({
                    'name': program_names[i].innerHTML,
                    'expires': expiration_date.toDateString(),
                    'expires_in': daysDiff
                  });
                } else {
                  expires_match = /^(Your Program purchase is pending and may take up to 24 hours to process.).+$/.exec(program_expires[i].innerHTML);
                  if (expires_match != null) {
                    team_programs.push({
                      'name': program_names[i].innerHTML,
                      'expires': expires_match[1],
                      'expires_in': expires_match[1]
                    });
                  }
                }
              }
              return team_programs;
            });
            programs[team.id] = team_programs;
          });
        });
      }, function() {
        this.capture(team.id + '_error.png');
      }, 10000);
    });
  });
});

casper.then(function() {
  for (i in teams) {
    var team = teams[i];
    this.echo('=== Team ' + team.name + ' ===');
    this.echo('\t--- Programs ---');
    for (j in programs[team.id]) {
      var program = programs[team.id][j];
      this.echo('\t\t' + program['name'] + ' expires in ' + program['expires_in'] + ' day(s)');
    }
    this.echo('\t--- Certificates ---');
    for (j in certs[team.id]) {
      var cert = certs[team.id][j];
      this.echo('\t\t' + cert['name'] + ' (' + cert['type'] + ') expires in ' + cert['expires_in'] + ' day(s))');
    }
    this.echo('\t--- Provisioning Profiles ---');
    for (j in profiles[team.id]) {
      var profile = profiles[team.id][j];
      this.echo('\t\t' + profile['name'] + ' expires in ' + profile['expires_in'] + ' day(s)');
    }
    this.echo('');
  }
});

casper.run();
