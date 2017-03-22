#!/bin/perl

use strict;
use POSIX qw(tmpnam);

# TODO: random mirror

my $mirror = "https://cran.revolutionanalytics.com";
my $file = "/web/packages/available_packages_by_name.html";
my $local = "packages.html";
my $output = "packages.json";

my $fetch = 0;
my $console = 0;

foreach my $arg (@ARGV){
  if( $arg =~ /--mirror=(.*)$/ ){ $mirror = $1; }
  elsif( $arg =~ /--output=(.*)$/ ){ $output = $1; }
  elsif( $arg =~ /--local=(.*)$/ ){ $local = $1; }
  elsif( $arg =~ /--fetch/ ){ $fetch = 1; }
  elsif( $arg =~ /--console/ ){ $console = 1; }
  elsif( $arg =~ /(?:--help|-\?)/){
    print <<END;

This script reads the html package table available on CRAN mirrors and 
generates a JSON file containing short descriptions of packages.  I'm sure 
this data is available somewhere in a usable format, but I can't find it.

The intent is to host the package file on github, and fetch it via CDN.
We will update periodically so it should be read using the commit ID.

Usage: perl $0 options 
options: 
  --mirror=cran-mirror-url     a cran mirror expected to host the package table
  --output=output-json-file    path to generated json file (packages.json)
  --local=temp-html-file       path to temporary download file (packages.html)
  --fetch                      if omitted, script will read existing html file
  --console                    write JSON to console instead of output file
  --help, -?                   print this message and exit

END
    exit;
  }
}

print "using mirror: $mirror\n";

if( $fetch ){
  # CRAN-listed mirrors generally include a trailing slash, clean up JIC
  $mirror =~ s/\/+$//g;
  my $url = $mirror . $file;
  print "fetching file...\n";
  `rm $local` if -e $local;
  `wget -O $local $url`;
}
else {
  print "using existing file\n";
}

my $contents;
open( F, $local ) or die( "ERROR opening $local\n");
while( my $line = <F>){ $contents .= $line; }
close(F);

my @entries;
while( $contents =~ /<tr>\s*<td>\s*<a href=".*?">(.*?)<\/a>\s*<\/td>\s*<td>(.*?)<\/td>\s*<\/tr>/gm ){
  my ($name, $desc) = ($1, $2);
  $desc =~ s/\"/\\"/g;
  push @entries, "\"$name\": \"$desc\"";
}

my $date = time();
my $entries = join(",\n    ", @entries);

my $json = <<END;
{
  "description": "This file is a map of CRAN package names to short descriptions, generated from a CRAN mirror.",
  "for-more-information": "https://github.com/sdllc/BERTConsole/tree/master/util",
  "source": "$mirror",
  "date": $date,
  "packages": {
    $entries
  }
}
END

if( $console ){
  print $json;
}
else {
  open( F, ">$output" ) or die( "ERROR opening $output for writing\n" );
  print F $json;
  close(F);
}

