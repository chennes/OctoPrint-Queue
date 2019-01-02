# OctoPrint-Queue

This plugin provides a simple print queue with support for priority categories. When you upload a file the system presents a dialog for entering the file into your print queue, or you can manually click the "Add to queue" button. The queue sorts by those categories first, and then within each category by submission date. So, for example, if you have categories "Urgent", "Customer", and "Staff", your urgent prints will be at the top of the queue, followed by customer, then staff. The oldest urgent job is at the top, and the newest staff job is at the bottom. When a print has been completed, an "archive" button removes it from the queue (but retains it in the database for record-keeping).

The queue was designed for use by staff at a public library, so it also supports keeping track of customer contact information, job cost, a staff contact person for the job, and a general-purpose notes field.

## Setup

Install via the bundled [Plugin Manager](https://github.com/foosel/OctoPrint/wiki/Plugin:-Plugin-Manager)
or manually using this URL:

    https://github.com/chennes/OctoPrint-Queue/archive/master.zip

## Configuration

The plugin ships with the following priority categories preconfigured:
 - Urgent
 - Customer
 - Student
 - Internal
 - Other

This is configurable via the OctoPrint preferences dialog: you can have as many or as few categories as you want, and they can be in whatever order you want. For example, you might just have "Urgent" and "Normal." Note that changing the available categories while there are jobs in the queue may result in some confusion, since the job's category or priority may have changed. 

Copyright 2019 [Pioneer Library System](http://pioneerlibrarysystem.org). Released under the [GNU Affero General Public License](https://www.gnu.org/licenses/agpl-3.0.en.html). Some rights reserved.
