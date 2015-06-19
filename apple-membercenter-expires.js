var utils = require('utils');
// utils.dump() for debug
var fs = require('fs');

var scriptDir = fs.absolute(require('system').args[3]).replace('apple-membercenter-expires.js', '');

var select_team_page = 'https://developer.apple.com/account/selectTeam.action';
var distrib_certs_page = 'https://developer.apple.com/account/ios/certificate/certificateList.action?type=distribution';
var distrib_profiles_page = 'https://developer.apple.com/account/ios/profile/profileList.action?type=production';
var prog_summary_page = 'https://developer.apple.com/membercenter/index.action#progSummary';

var teams;
var certificates = {};
var profiles = {};
var programs = {};
var statfile;   
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
  statfile = fs.open(config.statfile + '.tmp', 'w');
});

casper.thenOpen(select_team_page, function openSelectTeamPage(response) {
  this.fillSelectors('form#command', {
    'input[name="appleId"]':          config.appleid,
    'input[name="accountPassword"]':  config.password
  }, true);
}).then(function getTeamsList() {
  teams = this.evaluate(function() {
    var teams = [];
    $('.input').children('.team-value').each(function () {
      teams.push({
        'id': $(this).children('.radio').val(),
        'name': $.trim($(this).children('.label-primary').text()),
        'program': $(this).children('.label-secondary').text()
      });
    });
    return teams;
  });
});

casper.then(function getCertificates() {
  this.eachThen(teams, function(team_data) {
    var team = team_data.data;
    var status = 'ok';
    var team_certificates = {};
    this.thenOpen(select_team_page, function openSelectTeamPage() {
    }).waitForSelector('form#saveTeamSelection', function waitForSelectTeamPage() {
      }, function() {
        fs.write(config.logfile, 'ERROR: Could not open select team page for team: ' + team.id + '\n', 'a');
        status = 'fail';
    }).then(function selectTeam() {
      if (status === 'ok') {
        this.fillSelectors('form#saveTeamSelection', {
          'input[name="memberDisplayId"]':  team.id,
        }, true);
      }
    }).waitForSelector('#content', function waitForTeamSelected() {
    }, function() {
      fs.write(config.logfile, 'ERROR: Could not select team: ' + team.id + '\n', 'a');
      status = 'fail';
    }).thenOpen(distrib_certs_page, function openCertsPage() {
    }).waitForSelector(".innercontent", function waitForCertsPage() {
    }, function() {
      fs.write(config.logfile, 'ERROR: Could not open provision certificates page for team ' + team.id + '\n', 'a');
      status = 'fail';
    }).then(function checkCertsPage() {
      if (status === 'ok') {
        status = this.evaluate(function () {
          if ($('.innercontent').find('.overview').length === 1) {
            return 'fail';
          }
          if ($('.innercontent').find('.no-items-content').length === 1) {
            return 'empty';
          }
          return 'ok';
        });
      }
    }).then(function getCertsData() {
      if (status === 'ok') {
        team_certificates = this.evaluate(function() {
          var team_certificates = {};
          $('#grid-table').find('tr.ui-widget-content').each(function() {
            var expires = $(this).find("td[aria-describedby='grid-table_expirationDateString']").text();
            var name = $(this).find("td[aria-describedby='grid-table_name']").text();
            var expiration_date = new Date(expires);
            var diff = expiration_date - Date.now();
            var daysDiff = Math.ceil(diff / (1000 * 3600 * 24));
            team_certificates[name] = {
              'type': $(this).find("td[aria-describedby='grid-table_typeString']").text(),
              'expires': expiration_date.toDateString(),
              'expires_in': daysDiff
            };
          });
          return team_certificates;
        });
        certificates[team.id] = team_certificates;
      }
    });
  });
});

casper.then(function getProfiles() {
  this.eachThen(teams, function(team_data) {
    var team = team_data.data;
    var status = 'ok';
    profiles[team.id] = {};
    this.thenOpen(select_team_page, function openSelectTeamPage() {
    }).waitForSelector('form#saveTeamSelection', function waitForSelectTeamPage() {
      }, function() {
        fs.write(config.logfile, 'ERROR: Could not open select team page for team: ' + team.id + '\n', 'a');
        status = 'fail';
    }).then(function selectTeam() {
      if (status === 'ok') {
        this.fillSelectors('form#saveTeamSelection', {
          'input[name="memberDisplayId"]':  team.id,
        }, true);
      }
    }).waitForSelector('#content', function waitForTeamSelected() {
    }, function() {
      fs.write(config.logfile, 'ERROR: Could not select team: ' + team.id + '\n', 'a');
      status = 'fail';
    }).thenOpen(distrib_profiles_page, function openProfilesPage() {
    }).waitForSelector(".innercontent", function waitForProfilesPage() {
    }, function() {
      fs.write(config.logfile, 'ERROR: Could not open provision profiles page for team ' + team.id + '\n', 'a');
      status = 'fail';
    }).then(function checkProfilesPage() {
      if (status === 'ok') {
        status = this.evaluate(function () {
          if ($('.innercontent').find('.overview').length === 1) {
            return 'fail';
          }
          if ($('.innercontent').find('.no-items-content').length === 1) {
            return 'empty';
          }
          return 'ok';
        });
      }
    }).then(function getProfileNames() {
      if (status === 'ok') {
        team_profile_names = this.evaluate(function() {
          var team_profile_names = [];
          $('#grid-table').find('tr.ui-widget-content').each(function() {
            var type = $(this).find("td[aria-describedby='grid-table_type']").text();
            if ( type === 'iOS Distribution' || type === 'iOS UniversalDistribution') {
              team_profile_names.push($(this).find("td[aria-describedby='grid-table_name']").text());
            }
          });
          return team_profile_names;
        });
      }
    }).then(function getProfilesData() {
      if (status === 'ok') {
        this.eachThen(team_profile_names, function(response) {
          var team_profile = {};
          var profile_name = response.data;
          this.then(function(){
            this.click('#grid-table td[title="' + profile_name + '"]');
          }).then(function(){
            team_profile = this.evaluate(function() {
              return {
                'status': $('#grid-table').find('dd.status').last().text(),
                'type': $('#grid-table').find('dd.type').last().text(),
                'expires': $('#grid-table').find('dd.dateExpire').last().text()
              };
            });
          }).then(function(){
            var expirationDate = new Date(team_profile.expires);
            var diff = expirationDate - Date.now();
            var daysDiff = Math.ceil(diff / (1000 * 3600 * 24));
            team_profile['expires'] = expirationDate.toDateString();
            team_profile['expires_in'] = daysDiff;
            profiles[team.id][profile_name] = team_profile;
          });
        });
      }
    });
  });
});

casper.then(function getPrograms() {
  this.eachThen(teams, function(team_data) {
    var team = team_data.data;
    var status = 'ok';
    var team_program = {};
    this.thenOpen(select_team_page, function openSelectTeamPage() {
    }).waitForSelector('form#saveTeamSelection', function waitForSelectTeamPage() {
      }, function() {
        fs.write(config.logfile, 'ERROR: Could not open select team page for team: ' + team.id + '\n', 'a');
        status = 'fail';
    }).then(function selectTeam() {
      if (status === 'ok') {
        this.fillSelectors('form#saveTeamSelection', {
          'input[name="memberDisplayId"]':  team.id,
        }, true);
      }
    }).waitForSelector('#content', function waitForTeamSelected() {
    }, function() {
      fs.write(config.logfile, 'ERROR: Could not select team: ' + team.id + '\n', 'a');
      status = 'fail';
    }).thenOpen(prog_summary_page, function openProgSummaryPage() {
    }).waitForSelector(".programs", function waitForProgSummaryPage() {
    }, function() {
      fs.write(config.logfile, 'ERROR: Could not open programs page for team ' + team.id + '\n', 'a');
      status = 'fail';
    }).then(function getProgramsData() {
      var team_program = this.evaluate(function() {
        var expires = document.querySelectorAll('.programs li')[0].innerHTML.replace("Expiration Date: ", "");
        var expirationDate = new Date(expires);
        var diff = expirationDate - Date.now();
        var daysDiff = Math.ceil(diff / (1000 * 3600 * 24));
        return {
          'type': document.querySelector('.programs h4').innerHTML,
          'expires': expirationDate.toDateString(),
          'expires_in': daysDiff,
        };
      });
      programs[team.id] = team_program;
    });
  });
});

casper.then(function printExpiringSoon() {
  var statfile = fs.open(config.statfile + '.tmp', 'w');
  // utils.dump(teams);
  // utils.dump(programs);
  // utils.dump(profiles);
  var team, program, cert, profile;
  for (var i=0, teams_count=teams.length; i<teams_count; i++) {
    team = teams[i];
    program = programs[team.id];
    if (program['expires_in'] <= config.deadline) {
      statfile.writeLine(program['type'] + " for \"" + team.name + "\" team will expire in " + program['expires_in'] + " day(s) " + " (" + program['expires'] + ")");
      hasExpirations = true;
    }
    for (var cert_name in certificates[team.id]) {
      cert = certificates[team.id][cert_name];
      if (cert['expires_in'] <= config.deadline) {
        statfile.writeLine("Cert \"" + cert['type'] + ": " + cert_name + "\" for \"" + team.name + "\" team will expire in " + cert['expires_in'] + " day(s) " + " (" + cert['expires'] + ")");
        hasExpirations = true;
      }
    }
    for (var profile_name in profiles[team.id]) {
      profile = profiles[team.id][profile_name];
      if (profile['expires_in'] <= config.deadline) {
        statfile.writeLine("Profile \"" + profile['type'] + ": " + profile_name + "\" for " + team.name + " team will expire in " + profile['expires_in'] + " day(s) " + " (" + profile['expires'] + ") Status: " + profile['status']);
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
