var utils = require('utils');
// utils.dump() for debug
var fs = require('fs');

var scriptDir = fs.absolute(require('system').args[3]).replace('apple-membercenter-expires.js', '');

var select_team_page = 'https://developer.apple.com/membercenter/selectTeam.action';
var distrib_certs_page = 'https://developer.apple.com/account/ios/certificate/certificateList.action?type=distribution';
var distrib_profiles_page = 'https://developer.apple.com/account/ios/profile/profileList.action?type=production';
var prog_summary_page = 'https://developer.apple.com/membercenter/index.action#progSummary';

var teams;
var certs = {};
var profiles = {};
var programs = {};

var hasExpirations = false;

var casper = require('casper').create({
  pageSettings: {
    loadImages:  false,
    loadPlugins: false
  },
  // logLevel: "debug",
  // logLevel: "info",
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


casper.then(function parseConfig() {
  configFile = fs.read(scriptDir + 'config.json');
  config = JSON.parse(configFile);
  this.options.waitTimeout = config.waitTimeout;
  this.options.timeout = config.timeout;
  var currentDate = new Date();
  var day = currentDate.getDate();
  var month = currentDate.getMonth() + 1;
  var year = currentDate.getFullYear();
  fs.write(config.logfile, 'Execution date: ' + day + "/" + month + "/" + year + '\n', 'a');
});

casper.thenOpen(select_team_page, function openSelectTeamPage(response) {
  this.fillSelectors('form#command', {
    'input[name="appleId"]':          config.appleid,
    'input[name="accountPassword"]':  config.password
  }, true);
});

casper.then(function getTeamsList() {
  teams = this.evaluate(function() {
    var teams = [];
    var team_nodes = document.querySelectorAll('#teams option');
    for (var i = 0, teams_count = team_nodes.length; i < teams_count; i++) {
      teams.push({
        'id': team_nodes[i].value,
        'name': team_nodes[i].innerHTML
      });
    }
    return teams;
  });
});

// // Getting certs stats
casper.then(function getCerts() {
  this.each(teams, function(self, team) {
    self.thenOpen(select_team_page, function openSelectTeamPage(response) {
      this.waitForSelector('form#saveTeamSelection', function selectTeam() {
        this.fillSelectors('form#saveTeamSelection', {
          'select[name="memberDisplayId"]':  team.id,
        }, true)
      }, function() {
        // this.capture(team.id + '_select_timeout.png');
        fs.write(config.logfile, 'ERROR: Could not open select team page for team: ' + team.id + '\n', 'a');
      });
      this.thenOpen(distrib_certs_page, function openCertsPage(response) {
        this.waitForSelector('div.ios', function() {
          var itemsFound = this.thenEvaluate(function() {
            return document.querySelector(".no-items-content") ? true : false;
          });
          this.then(function() {
            if (itemsFound) {
              var certs_data = this.evaluate(function() {
                var certs_data = [];
                var cert_name_nodes = document.querySelectorAll('#grid-table td[aria-describedby="grid-table_name"]');
                var cert_type_nodes = document.querySelectorAll('#grid-table td[aria-describedby="grid-table_typeString"]');
                var cert_expires_nodes = document.querySelectorAll('#grid-table td[aria-describedby="grid-table_expirationDateString"]');
                var name, type, expires;
                for (var i = 0, certs_count = cert_name_nodes.length; i < certs_count; i++) {
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
            }
          });
        }, function() {
          // this.capture(team.id + '_certs_timeout.png');
          fs.write(config.logfile, 'ERROR: Could not open certs page for team ' + team.id + '\n', 'a');
        });
      });
    });
  });
});

// Getting provisioning profiles
casper.then(function getProfiles() {
  this.each(teams, function(self, team) {
    self.thenOpen(select_team_page, function selectTeam() {
      this.log('Select ' + team.id + '..', 'info');
      this.fillSelectors('form#saveTeamSelection', {
        'select[name="memberDisplayId"]':  team.id,
      }, true);
      this.thenOpen(distrib_profiles_page, function openProfilesPage() {
        this.waitForSelector('div.ios', function() {
          var itemsFound = this.thenEvaluate(function() {
            return document.querySelector(".no-items-content") ? true : false;
          });
          this.then(function() {
            if (itemsFound) {
              var team_profiles = this.evaluate(function() {
                var team_profiles = [];
                var result_names =  document.querySelectorAll('#grid-table td[aria-describedby="grid-table_name"]');
                var result_types =  document.querySelectorAll('#grid-table td[aria-describedby="grid-table_type"]');
                var result_statuses =  document.querySelectorAll('#grid-table td[aria-describedby="grid-table_status"]');
                for (var i=0, profiles_count = result_names.length; i<profiles_count; i++) {
                  team_profiles.push({
                    'name': result_names[i].getAttribute('title'),
                    'type': result_types[i].getAttribute('title'),
                    'status': result_statuses[i].getAttribute('title')
                  });
                }
                return team_profiles;
              });
              profiles[team.id] = [];
              this.eachThen(team_profiles, function getProfileInfo(response) {
                var team_profile = response.data;
                var name = team_profile['name'];
                var type = team_profile['type'];
                var status = team_profile['status'];
                if (type == 'iOS Distribution' || type == 'iOS UniversalDistribution') {
                  this.evaluate(function(){
                    $('#grid-table tr td[tabindex=1]').remove();
                  });
                  this.click('#grid-table td[title="' + name + '"]');
                  // this.capture(team.id + '_' + name + '_opened_profiles.png');
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
            }
          });
        }, function() {
          // this.capture(team.id + '_timeout.png');
          fs.write(config.logfile, 'ERROR: Could not open provision profiles page for team ' + team.id + '\n', 'a');
        });
      });
    });
  });
});


// // Getting programs
casper.then(function getPrograms() {
  this.each(teams, function(self, team) {
    this.thenOpen(select_team_page, function selectTeam(response) {
      this.waitForSelector('form#saveTeamSelection', function() {
        this.fillSelectors('form#saveTeamSelection', {
          'select[name="memberDisplayId"]':  team.id,
        }, true);
        this.thenOpen(prog_summary_page, function openProgramsPage() {
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
          }, function() {
            fs.write(config.logfile, 'ERROR: Could not open programs page for team ' + team.id + '\n', 'a');
            // this.capture(team.id + '_error.png');
          });
        });
      }, function() {
        fs.write(config.logfile, 'ERROR: Could not open team page for team ' + team.id + '\n', 'a');
      });
    });
  });
});

casper.then(function printExpiringSoon() {
  var statfile = fs.open(config.statfile + '.tmp', 'w');
  // utils.dump(teams);
  // utils.dump(programs);
  // utils.dump(certs);
  // utils.dump(profiles);
  var team, program, cert, profile;
  for (var i=0, teams_count=teams.length; i<teams_count; i++) {
    team = teams[i];
    for (var j=0, programs_count = programs[team.id] ? programs[team.id].length : 0; j < programs_count; j++) {
      program = programs[team.id][j];
      if (program['expires_in'] <= config.deadline) {
        statfile.writeLine("Program " + program['name'] + " for \"" + team.name + "\" team will expire in " + program['expires_in'] + " day(s) " + " (" + program['expires'] + ")");
        hasExpirations = true;
      }
    }
    for (var k=0, certs_count = certs[team.id] ? certs[team.id].length : 0; k < certs_count; k++) {
      cert = certs[team.id][k];
      if (cert['expires_in'] <= config.deadline) {
        statfile.writeLine("Cert \"" + cert['type'] + ": " + cert['name'] + "\" for \"" + team.name + "\" team will expire in " + cert['expires_in'] + " day(s) " + " (" + cert['expires'] + ")");
        hasExpirations = true;
      }
    }
    for (var l=0, profiles_count = profiles[team.id] ? profiles[team.id].length : 0; l < profiles_count; l++) {
      profile = profiles[team.id][l];
      if (profile['expires_in'] <= config.deadline) {
        statfile.writeLine("Profile \"" + profile['type'] + ": " + profile['name'] + "\" for " + team.name + " team will expire in " + profile['expires_in'] + " day(s) " + " (" + profile['expires'] + ") Status: " + profile['status']);
        hasExpirations = true;
      }
    }
  }
  if (! hasExpirations) { statfile.writeLine("No expirations in comming " + config.deadline + " day(s)"); }
  statfile.close();
  if (fs.exists(config.statfile)) {
    fs.remove(config.statfile);
  }
  fs.move(config.statfile + '.tmp', config.statfile);
});

casper.run();
